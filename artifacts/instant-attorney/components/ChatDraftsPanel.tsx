"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import type { ClientWorkspaceDraft } from "@/lib/types";
import { findBlanks, type DraftBlank } from "@/lib/freestyle-drafts";
import { runPromoteWithSaveGuard } from "@/lib/draft-promote-guard";
import { resolveDraftFocus, missingDraftNotice } from "@/lib/draft-focus";
import type { DraftGenerationJob } from "@/lib/draft-generation-status";

// Consumer freestyle drafts panel — the docked right side of the split screen.
// Mirrors the attorney workspace panel: draft tabs, an editable title + body with
// debounced autosave, download, delete, and a "send to my attorney" action that
// promotes the draft into the documents -> review pipeline. Reuses the dark
// .fs-draft-* styles, which match the navy consumer chat.
export default function ChatDraftsPanel({
  caseFileId,
  refreshKey,
  focusId = null,
  focusTitle = null,
  focusNonce = 0,
  onClose,
}: {
  caseFileId: string;
  refreshKey: number;
  /** Select the draft with this id once loaded (deep link from the case file). */
  focusId?: string | null;
  /** Or select by title (in-chat draft chip click). */
  focusTitle?: string | null;
  /** Bump to re-apply the focus even when id/title are unchanged. */
  focusNonce?: number;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<ClientWorkspaceDraft[]>([]);
  // Load state is explicit because "still loading", "the request failed", and
  // "you have no drafts" used to render as the same empty panel — which is what
  // a client clicking Open draft and seeing nothing was actually looking at.
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [notice, setNotice] = useState("");
  const [jobs, setJobs] = useState<Array<DraftGenerationJob & { label: string; active: boolean }>>([]);
  const priorJobsRef = useRef<Map<string, string>>(new Map());
  // preview = rendered view with highlighted [[placeholders]]; edit = raw textarea
  const [viewMode, setViewMode] = useState<"preview" | "edit">("preview");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Tracks the promise of any currently in-flight save so promote() can await
  // it even if dirty has already been cleared by the time promote is called.
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const draftsRef = useRef<ClientWorkspaceDraft[]>([]);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);
  // Mirrored so a refresh-driven reload can avoid clobbering an unsaved edit.
  const dirtyRef = useRef(false);
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);
  // A one-shot "jump to this draft" request from the chat (chip click or deep
  // link). Consumed by the next load() so it survives the async fetch, then cleared
  // so it never overrides the user's later manual tab selection.
  const pendingFocusRef = useRef<{ id: string | null; title: string | null } | null>(null);

  const active = drafts.find((d) => d.id === activeId) ?? null;
  const blanks = useMemo(() => (active ? findBlanks(active.content) : []), [active]);

  // Jump the editor to a blank and select it, so "fill this in" is one click.
  function jumpToBlank(b: DraftBlank) {
    const el = bodyRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(b.index, b.index + b.raw.length);
    // Textareas don't reliably scroll a selection into view — approximate from
    // the line the blank sits on so it lands a few lines down from the top.
    const lineHeight = parseInt(getComputedStyle(el).lineHeight) || 20;
    const line = el.value.slice(0, b.index).split("\n").length;
    el.scrollTop = Math.max(0, (line - 3) * lineHeight);
  }

  const load = useCallback(async () => {
    let res: Response;
    try {
      res = await fetch(`/api/workspace/drafts?caseFileId=${caseFileId}`);
    } catch {
      // Never leave the panel looking empty on a network failure — an empty
      // panel reads as "you have no drafts", which is a lie the client acts on.
      setLoadState((s) => (s === "ready" ? s : "error"));
      return;
    }
    if (!res.ok) {
      setLoadState((s) => (s === "ready" ? s : "error"));
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data) {
      setLoadState((s) => (s === "ready" ? s : "error"));
      return;
    }
    const list = (data.drafts ?? []) as ClientWorkspaceDraft[];
    if (Array.isArray(data.generationJobs)) {
      setJobs(data.generationJobs as Array<DraftGenerationJob & { label: string; active: boolean }>);
    }
    // Don't overwrite an unsaved local edit of the active draft (e.g. a
    // refreshKey bump from a just-produced draft while the user is typing).
    const localActive = dirtyRef.current && activeIdRef.current
      ? draftsRef.current.find((d) => d.id === activeIdRef.current)
      : undefined;
    setDrafts(localActive ? list.map((d) => (d.id === localActive.id ? localActive : d)) : list);
    setLoadState("ready");

    // Honor a pending "jump to this draft" request (from a chip click / deep link).
    const focus = pendingFocusRef.current;
    const outcome = resolveDraftFocus(list, activeIdRef.current, focus);
    if (outcome.kind !== "none") pendingFocusRef.current = null;
    setActiveId(outcome.activeId);
    // Say so rather than quietly opening a different document — on a legal file
    // showing document B when the client asked for document A is not cosmetic.
    if (outcome.kind === "missing") {
      setNotice(missingDraftNotice(outcome.requested, list.length > 0));
    } else if (outcome.kind === "focused") {
      setNotice("");
    }
  }, [caseFileId]);

  // Reload on mount and whenever the parent bumps refreshKey (a new draft arrived).
  useEffect(() => { load(); }, [load, refreshKey]);

  // Per-document recovery: a ready sibling opens immediately, even while other
  // jobs are still drafting or have failed. The durable endpoint also makes a
  // reconnect recover completions missed while this component was unmounted.
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/workspace/drafts/status?caseFileId=${caseFileId}`);
        if (!res.ok || stopped) return;
        const data = await res.json();
        const next = (data.jobs ?? []) as Array<DraftGenerationJob & { label: string; active: boolean }>;
        const previous = priorJobsRef.current;
        setJobs(next);
        for (const job of next) {
          const newlyReady = job.state === "ready" && previous.get(job.id) !== "ready";
          if (newlyReady && job.workspace_draft_id) {
            pendingFocusRef.current = { id: job.workspace_draft_id, title: null };
            await load();
            break;
          }
        }
        priorJobsRef.current = new Map(next.map((job) => [job.id, job.state]));
      } catch { /* reconnect on the next poll */ }
    };
    void poll();
    const timer = setInterval(poll, 3000);
    return () => { stopped = true; clearInterval(timer); };
  }, [caseFileId, load]);

  // A focus request from the chat — record it and reload so the just-produced
  // draft is present, then select it.
  useEffect(() => {
    if (!focusNonce) return;
    pendingFocusRef.current = { id: focusId, title: focusTitle };
    load();
    // Below 820px the panel stacks UNDER the chat instead of docking beside it,
    // so "Open draft" could open a panel that was never on screen. Bring it into
    // view on every focus request, not just the first.
    const el = paneRef.current;
    if (el && window.matchMedia("(max-width: 820px)").matches) {
      requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "nearest" }));
    }
  }, [focusNonce, focusId, focusTitle, load]);

  const save = useCallback(async (id: string, opts: { silent?: boolean } = {}): Promise<boolean> => {
    const toSave = draftsRef.current.find((d) => d.id === id);
    if (!toSave) return true; // nothing to save — treat as success
    if (!opts.silent) setSaving(true);
    let ok = false;
    try {
      const res = await fetch(`/api/workspace/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: toSave.title, content: toSave.content }),
      });
      ok = res.ok;
      if (ok) {
        const payload = await res.json().catch(() => null);
        if (payload?.draft) {
          setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, ...payload.draft } : d));
          if (payload.draft.revision_notice && payload.draft.revision_action !== "unpromoted") {
            setNotice(payload.draft.revision_notice);
          }
        }
        setDirty(false);
      }
    } catch {
      /* keep dirty; retry on next edit or blur */
    } finally {
      if (!opts.silent) setSaving(false);
      // Clear the in-flight ref once this save settles so future promotes
      // don't await a long-gone promise.
      if (savePromiseRef.current !== null) savePromiseRef.current = null;
    }
    return ok;
  }, []);

  function edit(patch: Partial<Pick<ClientWorkspaceDraft, "title" | "content">>) {
    if (!activeId) return;
    setDrafts((prev) => prev.map((d) => (d.id === activeId ? { ...d, ...patch } : d)));
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = activeId;
    saveTimer.current = setTimeout(() => {
      // Store the in-flight promise so promote() can await it if it fires
      // before this save has settled.
      savePromiseRef.current = save(id);
    }, 900);
  }

  async function newDraft() {
    const res = await fetch("/api/workspace/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseFileId, title: "Untitled draft", content: "" }),
    });
    if (res.ok) {
      const { draft } = await res.json();
      setDrafts((prev) => [draft, ...prev]);
      setActiveId(draft.id);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    const res = await fetch(`/api/workspace/drafts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDrafts((prev) => {
        const rest = prev.filter((d) => d.id !== id);
        if (activeId === id) setActiveId(rest[0]?.id ?? null);
        return rest;
      });
    }
  }

  async function promote(id: string) {
    setPromoting(true);
    setNotice("");

    const saveError = await runPromoteWithSaveGuard({
      // Hand the guard the current in-flight save promise (may be null).
      inFlightSave: savePromiseRef.current,
      // Read the live dirty flag *after* any in-flight save settles.
      isDirty: () => dirtyRef.current,
      // Fresh save if still dirty — store the promise so concurrent calls see it.
      save: () => {
        const p = save(id, { silent: true });
        savePromiseRef.current = p;
        return p;
      },
      promote: async () => {
        const res = await fetch(`/api/workspace/drafts/${id}/promote`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setNotice("Sent for attorney review — you'll find it under your documents.");
          setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, promoted_document_id: data.documentId } : d)));
        } else {
          setNotice(data.error ?? "Could not send for review.");
        }
      },
    });

    if (saveError) {
      setNotice(saveError);
    }

    setPromoting(false);
  }

  return (
    <div className="fc-draft-pane fs-draft-pane" ref={paneRef}>
      <div className="fs-draft-tabs">
        <div className="fs-draft-tabs-scroll">
          {drafts.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`fs-draft-tab${d.id === activeId ? " fs-draft-tab-active" : ""}`}
              onClick={() => { setActiveId(d.id); setNotice(""); }}
              title={d.title}
            >
              {d.title}
            </button>
          ))}
        </div>
        <button type="button" className="fs-draft-new" onClick={newDraft} title="New blank draft">＋</button>
        <button type="button" className="fs-draft-new" onClick={onClose} title="Hide drafts" aria-label="Hide drafts">×</button>
      </div>

      {jobs.length > 0 && (
        <div className="draft-job-list" aria-label="Draft generation status">
          {jobs.map((job) => (
            <article className={`draft-job-card draft-job-${job.state}`} key={job.id} role="status">
              <strong>{job.title}</strong><span>{job.label}</span>
              {job.missing_fact_labels.length > 0 && <small>Needed: {job.missing_fact_labels.join(", ")}</small>}
              {job.latest_revision > 0 && <small>Revision {job.latest_revision}</small>}
              {job.state === "failed" && <small className="draft-job-error">{job.failure_message ?? "This draft could not be generated."}</small>}
              {job.active && <button type="button" onClick={() => fetch(`/api/workspace/drafts/status?caseFileId=${caseFileId}&jobId=${job.id}`, { method: "DELETE" })}>Cancel</button>}
            </article>
          ))}
        </div>
      )}

      {active ? (
        <div className="fs-draft-editor">
          <div className="fs-draft-editor-head">
            <input
              className="fs-draft-title"
              value={active.title}
              onChange={(e) => edit({ title: e.target.value })}
              placeholder="Draft title"
            />
            <div className="fs-draft-editor-actions">
              {/* Edit / Preview toggle */}
              <button
                type="button"
                className={`fc-draft-mode-btn${viewMode === "preview" ? " fc-draft-mode-btn-active" : ""}`}
                onClick={() => setViewMode(viewMode === "preview" ? "edit" : "preview")}
                title={viewMode === "preview" ? "Switch to edit mode" : "Switch to preview (highlights blanks)"}
              >
                {viewMode === "preview" ? "Edit" : "Preview"}
              </button>
              <span className="fs-draft-save-state">{saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}</span>
              <a className="fs-draft-dl" href={`/api/workspace/drafts/${active.id}/download`} title="Download as Word document">Download Word (.docx)</a>
              <button type="button" className="fs-draft-del" onClick={() => remove(active.id)} title="Delete draft">Delete</button>
            </div>
          </div>

          {viewMode === "preview" ? (
            /* Rendered preview — [[placeholder]] tokens appear as yellow highlighted chips */
            <div className="fc-draft-preview fs-draft-body" onClick={() => setViewMode("edit")}>
              {active.content.trim() ? (
                active.content.split(/(\[\[[^\]]+\]\])/g).map((part, i) => {
                  if (/^\[\[[^\]]+\]\]$/.test(part)) {
                    return (
                      <mark key={i} className="fc-draft-blank-mark" title="Click Edit to fill this in">
                        {part.slice(2, -2)}
                      </mark>
                    );
                  }
                  return <span key={i} style={{ whiteSpace: "pre-wrap" }}>{part}</span>;
                })
              ) : (
                <span className="fc-draft-preview-empty">{emptyShellCopy(jobs.find((job) => job.workspace_draft_id === active.id))}</span>
              )}
              {blanks.length > 0 && (
                <div className="fc-draft-preview-hint">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {blanks.length} highlighted blank{blanks.length === 1 ? "" : "s"} — tap Edit to fill them in
                </div>
              )}
            </div>
          ) : (
            <textarea
              ref={bodyRef}
              className="fs-draft-body"
              value={active.content}
              onChange={(e) => edit({ content: e.target.value })}
              onBlur={() => { if (dirty && activeId) savePromiseRef.current = save(activeId); }}
              placeholder="Draft content…"
              spellCheck
            />
          )}

          {/* Blanks strip — only in edit mode so clicking a chip jumps the textarea */}
          {viewMode === "edit" && blanks.length > 0 && (
            <div className="fc-draft-blanks">
              <span className="fc-draft-blanks-label">
                {blanks.length} blank{blanks.length === 1 ? "" : "s"} to fill in
              </span>
              <div className="fc-draft-blanks-chips">
                {blanks.map((b) => (
                  <button
                    key={b.raw}
                    type="button"
                    className="fc-draft-blank-chip"
                    onClick={() => jumpToBlank(b)}
                    title="Jump to this blank in the draft"
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="fc-draft-promote-row">
            {active.promoted_document_id ? (
              <span className="fc-draft-promoted">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: "middle", marginRight: 4 }}><polyline points="20 6 9 17 4 12"/></svg>
                {active.revision_action === "create_revision"
                  ? "Saved as a new revision; the approved version is unchanged. Another attorney review is pending."
                  : active.revision_action === "revise_in_place"
                    ? "Revision saved. The earlier review was superseded and another attorney review is pending."
                    : "Sent to your attorney for review — you’ll find it under “With your attorney” on your case file."}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  className="fc-draft-promote-btn fc-draft-promote-btn-block"
                  onClick={() => promote(active.id)}
                  disabled={promoting || !active.content.trim()}
                  title={!active.content.trim() ? "Add content before sending for review" : "Submit this draft to your attorney"}
                >
                  {promoting ? (
                    "Sending…"
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ verticalAlign: "middle", marginRight: 5 }}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      Send to my attorney for review
                    </>
                  )}
                </button>
                <span className="fc-draft-promote-hint">
                  {!active.content.trim()
                    ? "Finish drafting before sending — ask your assistant to write it, or type directly above."
                    : "Andrew Crawford, Esq. reviews it and returns it within 48 hours."}
                </span>
              </>
            )}
            {notice && <span className="fc-draft-notice">{notice}</span>}
          </div>
        </div>
      ) : loadState === "loading" ? (
        <div className="fs-draft-empty" role="status">Opening your document…</div>
      ) : loadState === "error" ? (
        <div className="fs-draft-empty fc-draft-loaderr" role="alert">
          <p>Your documents couldn&apos;t be loaded just now. Nothing has been lost.</p>
          <button type="button" className="fc-draft-retry" onClick={() => { setLoadState("loading"); load(); }}>
            Try again
          </button>
        </div>
      ) : (
        <div className="fs-draft-empty">
          {notice ? <p className="fc-draft-notice">{notice}</p> : null}
          <p>Drafts you create here appear in this panel. Ask for a letter, agreement, or document to get started, or start one with ＋.</p>
        </div>
      )}
    </div>
  );
}

function emptyShellCopy(job?: Pick<DraftGenerationJob, "state" | "failure_message"> & { label: string; active: boolean }): string {
  if (job?.active) {
    return `${job.label} — this card is the document. The text appears when drafting finishes.`;
  }
  if (job?.state === "failed") {
    return job.failure_message ?? "This draft could not be generated. Ask your assistant to retry.";
  }
  return "Nothing drafted yet — ask your assistant to write a document, or switch to Edit and start typing.";
}
