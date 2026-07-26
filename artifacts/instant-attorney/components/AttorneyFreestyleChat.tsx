"use client";

import { useState, useRef, useEffect, FormEvent, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  parseDrafts,
  stripDraftsForDisplay,
  hasOpenDraft,
} from "@/lib/freestyle-drafts";
import { stripToolMarkers, activeToolNames } from "@/lib/tool-markers";
import ToolRunChips from "@/components/ToolRunChips";
import type { AttorneyWorkspaceDraft, WorkspaceAttachmentRef } from "@/lib/types";

type Msg = {
  role: "user" | "assistant";
  content: string;
  attachments?: WorkspaceAttachmentRef[];
};

const TRUNC = "\x01TRUNCATED\x01";
const MAX_FILE_BYTES = 25 * 1024 * 1024;

// Read a File as a bare base64 string (no data: prefix).
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result as string;
      const comma = res.indexOf(",");
      resolve(comma >= 0 ? res.slice(comma + 1) : res);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

// Attorney FREESTYLE workspace — a split screen behind the ACP wall. Left: an
// open-ended brainstorm with the associate, with files droppable inline. Right:
// the drafts the associate produced, editable and downloadable in place. Talks
// to /api/attorney/chat + /api/attorney/workspace/*; everything is attorney
// work-product persisted OUT of the client's privileged record. On leaving, the
// session is organized into the case file's Living File digest.
export default function AttorneyFreestyleChat({ caseFileId }: { caseFileId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [activeTools, setActiveTools] = useState<string[]>([]);

  // Inline attachment staged for the next send.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachError, setAttachError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  // Right-hand drafts panel.
  const [drafts, setDrafts] = useState<AttorneyWorkspaceDraft[]>([]);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [draftDirty, setDraftDirty] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const [organizing, setOrganizing] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const activeDraft = drafts.find((d) => d.id === activeDraftId) ?? null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const loadDrafts = useCallback(async (): Promise<AttorneyWorkspaceDraft[]> => {
    const res = await fetch(`/api/attorney/workspace/drafts?caseFileId=${caseFileId}`);
    if (!res.ok) return [];
    const data = await res.json();
    const list = (data.drafts ?? []) as AttorneyWorkspaceDraft[];
    setDrafts(list);
    return list;
  }, [caseFileId]);

  // Load prior work-product (messages + drafts) on first open.
  const hydrate = useCallback(async () => {
    if (hydrated) return;
    setHydrated(true);
    const supabase = createClient();
    const [{ data: msgData }, draftList] = await Promise.all([
      supabase
        .from("attorney_workspace_messages")
        .select("role, content, attachments, created_at")
        .eq("case_file_id", caseFileId)
        .order("created_at", { ascending: true }),
      loadDrafts(),
    ]);
    if (msgData?.length) {
      setMessages(
        msgData.map((m: { role: string; content: string; attachments?: WorkspaceAttachmentRef[] }) => ({
          role: m.role as Msg["role"],
          content: m.content,
          attachments: m.attachments ?? [],
        })),
      );
    }
    if (draftList.length) {
      setActiveDraftId((cur) => cur ?? draftList[0].id);
    }
  }, [caseFileId, hydrated, loadDrafts]);

  function openWorkspace() {
    setOpen(true);
    hydrate();
  }

  async function closeWorkspace() {
    // Flush any unsaved draft edit before organizing the session.
    if (draftDirty && activeDraft) await saveDraft(activeDraft.id, { silent: true });
    if (messages.length >= 2) {
      setOrganizing(true);
      try {
        await fetch("/api/attorney/workspace/organize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseFileId }),
        });
      } catch {
        /* non-fatal — closing must always succeed */
      } finally {
        setOrganizing(false);
      }
    }
    setOpen(false);
    router.refresh();
  }

  function autoResize() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }

  // ── Attachments ────────────────────────────────────────────────────────────
  function stageFile(file: File | null | undefined) {
    if (!file) return;
    setAttachError("");
    if (file.size > MAX_FILE_BYTES) {
      setAttachError("File exceeds the 25 MB limit.");
      return;
    }
    setPendingFile(file);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    stageFile(e.dataTransfer.files?.[0]);
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  async function send(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if ((!text && !pendingFile) || loading) return;

    let pendingAttachment: { fileName: string; mimeType: string; data: string } | null = null;
    let attachmentRef: WorkspaceAttachmentRef[] | undefined;
    if (pendingFile) {
      try {
        const data = await fileToBase64(pendingFile);
        pendingAttachment = {
          fileName: pendingFile.name,
          mimeType: pendingFile.type || "application/octet-stream",
          data,
        };
        // Optimistic chip on the user turn (storagePath filled server-side; the
        // local echo just needs a name to render).
        attachmentRef = [{ fileName: pendingFile.name, mimeType: pendingAttachment.mimeType, storagePath: "" }];
      } catch {
        setAttachError("Could not read that file — please try again.");
        return;
      }
    }

    const next: Msg[] = [...messages, { role: "user", content: text, attachments: attachmentRef }];
    setMessages(next);
    setInput("");
    setPendingFile(null);
    setLoading(true);
    setStreamingText("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    try {
      const res = await fetch("/api/attorney/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Send text-only history to the model; the file rides on pendingAttachment.
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          caseFileId,
          pendingAttachment,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Request failed");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        full += decoder.decode(value, { stream: true });
        setStreamingText(stripToolMarkers(full));
        setActiveTools(activeToolNames(full));
      }
      if (full.endsWith(TRUNC)) full = full.slice(0, -TRUNC.length);
      setActiveTools([]);
      full = stripToolMarkers(full);
      setMessages((prev) => [...prev, { role: "assistant", content: full }]);
      setStreamingText("");

      // The server persisted any ---DRAFT--- blocks; pull them into the panel.
      if (parseDrafts(full).length > 0) {
        const list = await loadDrafts();
        const titles = new Set(parseDrafts(full).map((d) => d.title));
        const justWritten = list.find((d) => titles.has(d.title));
        if (justWritten) {
          setActiveDraftId(justWritten.id);
          setPanelCollapsed(false);
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Something went wrong — please try again." },
      ]);
      setStreamingText("");
      setActiveTools([]);
    } finally {
      setLoading(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(e as unknown as FormEvent);
    }
  }

  // ── Drafts ────────────────────────────────────────────────────────────────
  // Mirror drafts into a ref so the debounced/blur save always reads the freshest
  // text, not a value captured when the timer was set.
  const draftsRef = useRef<AttorneyWorkspaceDraft[]>([]);
  useEffect(() => { draftsRef.current = drafts; }, [drafts]);

  const saveDraft = useCallback(async (id: string, opts: { silent?: boolean } = {}) => {
    const toSave = draftsRef.current.find((d) => d.id === id);
    if (!toSave) return;
    if (!opts.silent) setSavingDraft(true);
    try {
      const res = await fetch(`/api/attorney/workspace/drafts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: toSave.title, content: toSave.content }),
      });
      if (res.ok) setDraftDirty(false);
    } catch {
      /* keep dirty; will retry on next edit, blur, or close */
    } finally {
      if (!opts.silent) setSavingDraft(false);
    }
  }, []);

  function editActiveDraft(patch: Partial<Pick<AttorneyWorkspaceDraft, "title" | "content">>) {
    if (!activeDraftId) return;
    setDrafts((prev) => prev.map((d) => (d.id === activeDraftId ? { ...d, ...patch } : d)));
    setDraftDirty(true);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = activeDraftId;
    saveTimer.current = setTimeout(() => saveDraft(id), 900);
  }

  async function newDraft() {
    const res = await fetch("/api/attorney/workspace/drafts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ caseFileId, title: "Untitled draft", content: "" }),
    });
    if (res.ok) {
      const { draft } = await res.json();
      setDrafts((prev) => [draft, ...prev]);
      setActiveDraftId(draft.id);
      setPanelCollapsed(false);
    }
  }

  async function deleteDraft(id: string) {
    if (!confirm("Delete this draft? This cannot be undone.")) return;
    const res = await fetch(`/api/attorney/workspace/drafts/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDrafts((prev) => {
        const remaining = prev.filter((d) => d.id !== id);
        if (activeDraftId === id) setActiveDraftId(remaining[0]?.id ?? null);
        return remaining;
      });
    }
  }

  const hasDrafts = drafts.length > 0;

  return (
    <div className="atty-case-subsection">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <h3 className="atty-case-subtitle" style={{ margin: 0 }}>
          Freestyle Workspace{" "}
          <span style={{ opacity: 0.6, fontWeight: 400 }}>· your work-product, not shared with the client</span>
        </h3>
        <button type="button" onClick={openWorkspace} className="fs-open-btn">
          Open freestyle
        </button>
      </div>

      {open && (
        <div className="fs-overlay" role="dialog" aria-modal="true" aria-label="Freestyle workspace">
          {/* ── Top bar ─────────────────────────────────────────────────── */}
          <div className="fs-topbar">
            <div className="fs-topbar-title">
              <span className="fs-topbar-dot" />
              Freestyle Workspace
              <span className="fs-topbar-sub">privileged · work-product · not shared with the client</span>
            </div>
            <div className="fs-topbar-actions">
              {hasDrafts && (
                <button
                  type="button"
                  className="fs-ghost-btn"
                  onClick={() => setPanelCollapsed((c) => !c)}
                >
                  {panelCollapsed ? "Show drafts" : "Hide drafts"}
                </button>
              )}
              <button type="button" className="fs-close-btn" onClick={closeWorkspace} disabled={organizing}>
                {organizing ? "Organizing…" : "Close & organize"}
              </button>
            </div>
          </div>

          <div className="fs-body">
            {/* ── LEFT: chat ────────────────────────────────────────────── */}
            <div
              className={`fs-chat-pane${dragOver ? " fs-chat-pane-drop" : ""}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={onDrop}
            >
              <div className="fs-messages">
                {messages.length === 0 && !streamingText && (
                  <p className="fs-empty">
                    Open brainstorm. Think through the matter, stress-test the strategy, drop in screenshots or
                    documents, and draft against the client&apos;s file. Substantial drafts open in the panel on the
                    right to read, edit, and download. Nothing here is visible to the client.
                  </p>
                )}
                {messages.map((m, i) => {
                  const drafted = m.role === "assistant" ? parseDrafts(m.content) : [];
                  const body = m.role === "assistant" ? stripDraftsForDisplay(m.content) : m.content;
                  return (
                    <div key={i} className={`fs-msg ${m.role === "user" ? "fs-msg-user" : "fs-msg-assistant"}`}>
                      <span className="fs-msg-role">{m.role === "user" ? "You" : "Associate"}</span>
                      {m.attachments?.map((a, j) => (
                        <AttachmentChip key={j} att={a} />
                      ))}
                      {body && <div className="fs-msg-body">{body}</div>}
                      {drafted.map((d, j) => (
                        <button
                          key={j}
                          type="button"
                          className="fs-draft-chip"
                          onClick={() => {
                            const match = drafts.find((dr) => dr.title === d.title);
                            if (match) { setActiveDraftId(match.id); setPanelCollapsed(false); }
                          }}
                        >
                          <span className="fs-draft-chip-icon">📄</span>
                          <span className="fs-draft-chip-label">{d.title}</span>
                          <span className="fs-draft-chip-cta">open in panel →</span>
                        </button>
                      ))}
                    </div>
                  );
                })}
                {streamingText && (
                  <div className="fs-msg fs-msg-assistant">
                    <span className="fs-msg-role">Associate</span>
                    <div className="fs-msg-body">{stripDraftsForDisplay(streamingText)}</div>
                    <ToolRunChips tools={activeTools} />
                    {hasOpenDraft(streamingText) && (
                      <div className="fs-draft-chip fs-draft-chip-writing">
                        <span className="fs-draft-chip-icon">✍️</span>
                        <span className="fs-draft-chip-label">Writing draft…</span>
                      </div>
                    )}
                  </div>
                )}
                {loading && !streamingText && (
                  activeTools.length > 0
                    ? <div className="fs-msg fs-msg-assistant"><span className="fs-msg-role">Associate</span><ToolRunChips tools={activeTools} /></div>
                    : <div className="fs-thinking">Thinking…</div>
                )}
                <div ref={endRef} />
              </div>

              {/* Composer */}
              <form onSubmit={send} className="fs-composer">
                {pendingFile && (
                  <div className="fs-pending-file">
                    <span className="fs-pending-icon">{pendingFile.type.startsWith("image/") ? "🖼" : "📄"}</span>
                    <span className="fs-pending-name">{pendingFile.name}</span>
                    <button type="button" className="fs-pending-remove" onClick={() => setPendingFile(null)} aria-label="Remove attachment">×</button>
                  </div>
                )}
                {attachError && <div className="fs-attach-error">{attachError}</div>}
                <div className="fs-composer-row">
                  <button
                    type="button"
                    className="fs-attach-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading}
                    title="Attach a file or screenshot"
                    aria-label="Attach a file"
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                    </svg>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,.txt,.csv,.rtf"
                    style={{ display: "none" }}
                    onChange={(e) => { stageFile(e.target.files?.[0]); e.target.value = ""; }}
                  />
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={(e) => { setInput(e.target.value); autoResize(); }}
                    onKeyDown={onKeyDown}
                    rows={1}
                    placeholder="Ask, analyze, draft, or drop in a file… (Enter to send, Shift+Enter for a new line)"
                    disabled={loading}
                    className="fs-input"
                  />
                  <button type="submit" disabled={loading || (!input.trim() && !pendingFile)} className="fs-send-btn">
                    Send
                  </button>
                </div>
              </form>
            </div>

            {/* ── RIGHT: drafts panel ───────────────────────────────────── */}
            {hasDrafts && !panelCollapsed && (
              <div className="fs-draft-pane">
                <div className="fs-draft-tabs">
                  <div className="fs-draft-tabs-scroll">
                    {drafts.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        className={`fs-draft-tab${d.id === activeDraftId ? " fs-draft-tab-active" : ""}`}
                        onClick={() => setActiveDraftId(d.id)}
                        title={d.title}
                      >
                        {d.title}
                      </button>
                    ))}
                  </div>
                  <button type="button" className="fs-draft-new" onClick={newDraft} title="New blank draft">＋</button>
                </div>

                {activeDraft ? (
                  <div className="fs-draft-editor">
                    <div className="fs-draft-editor-head">
                      <input
                        className="fs-draft-title"
                        value={activeDraft.title}
                        onChange={(e) => editActiveDraft({ title: e.target.value })}
                        placeholder="Draft title"
                      />
                      <div className="fs-draft-editor-actions">
                        <span className="fs-draft-save-state">
                          {savingDraft ? "Saving…" : draftDirty ? "Unsaved" : "Saved"}
                        </span>
                        <a
                          className="fs-draft-dl"
                          href={`/api/attorney/workspace/drafts/${activeDraft.id}/download`}
                          title="Download as Markdown"
                        >
                          Download
                        </a>
                        <button
                          type="button"
                          className="fs-draft-del"
                          onClick={() => deleteDraft(activeDraft.id)}
                          title="Delete draft"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    <textarea
                      className="fs-draft-body"
                      value={activeDraft.content}
                      onChange={(e) => editActiveDraft({ content: e.target.value })}
                      onBlur={() => draftDirty && activeDraftId && saveDraft(activeDraftId)}
                      placeholder="Draft content…"
                      spellCheck
                    />
                  </div>
                ) : (
                  <div className="fs-draft-empty">Select a draft, or start a new one with ＋.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// A clickable chip for an inline attachment. A blank storagePath is a local echo
// (just uploaded, this render), so it shows non-clickable until the row reloads.
function AttachmentChip({ att }: { att: WorkspaceAttachmentRef }) {
  const icon = att.mimeType.startsWith("image/") ? "🖼" : "📄";
  if (!att.storagePath) {
    return (
      <span className="fs-att-chip fs-att-chip-static">
        <span className="fs-att-chip-icon">{icon}</span>
        {att.fileName}
      </span>
    );
  }
  return (
    <a
      className="fs-att-chip"
      href={`/api/attorney/workspace/attachment?path=${encodeURIComponent(att.storagePath)}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="fs-att-chip-icon">{icon}</span>
      {att.fileName}
    </a>
  );
}
