"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { ClientWorkspaceDraft } from "@/lib/types";

// Consumer freestyle drafts panel — the docked right side of the split screen.
// Mirrors the attorney workspace panel: draft tabs, an editable title + body with
// debounced autosave, download, delete, and a "send to my attorney" action that
// promotes the draft into the documents -> review pipeline. Reuses the dark
// .fs-draft-* styles, which match the navy consumer chat.
export default function ChatDraftsPanel({
  caseFileId,
  refreshKey,
  onClose,
}: {
  caseFileId: string;
  refreshKey: number;
  onClose: () => void;
}) {
  const [drafts, setDrafts] = useState<ClientWorkspaceDraft[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [notice, setNotice] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftsRef = useRef<ClientWorkspaceDraft[]>([]);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);

  const active = drafts.find((d) => d.id === activeId) ?? null;

  const load = useCallback(async () => {
    const res = await fetch(`/api/workspace/drafts?caseFileId=${caseFileId}`);
    if (!res.ok) return;
    const data = await res.json();
    const list = (data.drafts ?? []) as ClientWorkspaceDraft[];
    setDrafts(list);
    setActiveId((cur) => (cur && list.some((d) => d.id === cur) ? cur : list[0]?.id ?? null));
  }, [caseFileId]);

  // Reload on mount and whenever the parent bumps refreshKey (a new draft arrived).
  useEffect(() => { load(); }, [load, refreshKey]);

  const save = useCallback(async (id: string, opts: { silent?: boolean } = {}) => {
    const toSave = draftsRef.current.find((d) => d.id === id);
    if (!toSave) return;
    if (!opts.silent) setSaving(true);
    try {
      const res = await fetch(`/api/workspace/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: toSave.title, content: toSave.content }),
      });
      if (res.ok) setDirty(false);
    } catch {
      /* keep dirty; retry on next edit or blur */
    } finally {
      if (!opts.silent) setSaving(false);
    }
  }, []);

  function edit(patch: Partial<Pick<ClientWorkspaceDraft, "title" | "content">>) {
    if (!activeId) return;
    setDrafts((prev) => prev.map((d) => (d.id === activeId ? { ...d, ...patch } : d)));
    setDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = activeId;
    saveTimer.current = setTimeout(() => save(id), 900);
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
    if (dirty) await save(id, { silent: true });
    if (!confirm("Send this draft to your attorney for review? You'll get it back within 48 hours.")) return;
    setPromoting(true);
    setNotice("");
    try {
      const res = await fetch(`/api/workspace/drafts/${id}/promote`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setNotice("Sent for attorney review — you'll find it under your documents.");
        setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, promoted_document_id: data.documentId } : d)));
      } else {
        setNotice(data.error ?? "Could not send for review.");
      }
    } catch {
      setNotice("Could not send for review.");
    } finally {
      setPromoting(false);
    }
  }

  return (
    <div className="fc-draft-pane fs-draft-pane">
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
              <span className="fs-draft-save-state">{saving ? "Saving…" : dirty ? "Unsaved" : "Saved"}</span>
              <a className="fs-draft-dl" href={`/api/workspace/drafts/${active.id}/download`} title="Download as Markdown">Download</a>
              <button type="button" className="fs-draft-del" onClick={() => remove(active.id)} title="Delete draft">Delete</button>
            </div>
          </div>
          <textarea
            className="fs-draft-body"
            value={active.content}
            onChange={(e) => edit({ content: e.target.value })}
            onBlur={() => dirty && activeId && save(activeId)}
            placeholder="Draft content…"
            spellCheck
          />
          <div className="fc-draft-promote-row">
            {active.promoted_document_id ? (
              <span className="fc-draft-promoted">✓ Sent for attorney review</span>
            ) : (
              <button
                type="button"
                className="fc-draft-promote-btn"
                onClick={() => promote(active.id)}
                disabled={promoting || !active.content.trim()}
              >
                {promoting ? "Sending…" : "Send to my attorney for review"}
              </button>
            )}
            {notice && <span className="fc-draft-notice">{notice}</span>}
          </div>
        </div>
      ) : (
        <div className="fs-draft-empty">
          Drafts you create here appear in this panel. Ask for a letter, agreement, or document to get started, or start one with ＋.
        </div>
      )}
    </div>
  );
}
