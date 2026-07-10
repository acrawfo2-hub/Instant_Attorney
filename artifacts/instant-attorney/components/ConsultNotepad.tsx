"use client";

import { useState } from "react";
import type { ConsultNote } from "@/lib/types";

interface Props {
  consultId: string;
  initialNotes: ConsultNote[];
  /** Attorney mode gets an input + inline edit; reviewer mode is read-only. */
  editable: boolean;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ConsultNotepad({ consultId, initialNotes, editable }: Props) {
  const [notes, setNotes] = useState<ConsultNote[]>(initialNotes);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  async function addNote() {
    const body = draft.trim();
    if (!body) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to add note");
      setNotes((prev) => [...prev, data.note as ConsultNote]);
      setDraft("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  }

  async function saveEdit(noteId: string) {
    const body = editDraft.trim();
    if (!body) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/attorney/consult/${consultId}/notes/${noteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Failed to update note");
      setNotes((prev) => prev.map((n) => (n.id === noteId ? (data.note as ConsultNote) : n)));
      setEditingId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="lf-card lf-card-full">
      <div className="lf-card-label">Notes</div>

      {notes.length === 0 && !editable && <div className="lf-card-meta">No notes yet.</div>}

      {notes.map((n) =>
        editingId === n.id ? (
          <div key={n.id} className="lf-session-note">
            <textarea
              className="atty-second-draft-textarea"
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              rows={2}
              autoFocus
            />
            <div className="atty-second-draft-actions">
              <button className="atty-btn atty-btn-primary" disabled={submitting} onClick={() => saveEdit(n.id)}>
                Save
              </button>
              <button className="atty-btn" disabled={submitting} onClick={() => setEditingId(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div key={n.id} className="lf-session-note">
            <div className="lf-card-meta">{formatTimestamp(n.created_at)}</div>
            <p style={{ margin: "0.25rem 0" }}>{n.body}</p>
            {editable && (
              <button
                className="lf-expand-btn"
                onClick={() => {
                  setEditingId(n.id);
                  setEditDraft(n.body);
                }}
              >
                Edit
              </button>
            )}
          </div>
        )
      )}

      {editable && (
        <div className="lf-notepad-compose">
          <textarea
            className="atty-second-draft-textarea"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a note…"
            rows={3}
          />
          <div className="atty-second-draft-actions">
            <button className="atty-btn atty-btn-primary" disabled={submitting || !draft.trim()} onClick={addNote}>
              {submitting ? "Adding…" : "Add note"}
            </button>
          </div>
        </div>
      )}

      {error && <div className="lf-session-error">{error}</div>}
    </div>
  );
}
