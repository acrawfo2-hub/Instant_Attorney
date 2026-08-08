"use client";

import { useMemo, useState } from "react";
import { placeholderFields, applyPlaceholderAnswers } from "@/lib/wizard-parsing";

// Inline fill-in panel for workspace drafts (client_workspace_drafts). Applies
// [[placeholder]] answers client-side (pure substitution, no model call) then
// PATCHes the draft content via /api/workspace/drafts/[id]. Renders nothing when
// the draft has no remaining blanks.
export default function WorkspaceDraftInfoNeeded({
  draftId,
  draftText,
  draftTitle,
  onSaved,
}: {
  draftId: string;
  draftText: string;
  draftTitle: string;
  onSaved: (newContent: string) => void;
}) {
  const fields = useMemo(() => placeholderFields(draftText), [draftText]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (!fields.length) return null;

  const required = fields.filter((f) => f.required);
  const optional = fields.filter((f) => !f.required);
  const filledCount = fields.filter((f) => answers[f.key]?.trim()).length;

  async function save() {
    if (saving || filledCount === 0) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      // Apply answers client-side — pure substitution, no AI.
      const { text: newContent, filled } = applyPlaceholderAnswers(draftText, answers);
      const remaining = fields.length - filled;

      const res = await fetch(`/api/workspace/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newContent }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save your answers.");
        setSaving(false);
        return;
      }
      setMessage(
        remaining > 0
          ? `Saved. ${filled} blank${filled === 1 ? "" : "s"} filled — ${remaining} still open.`
          : `Saved. All blanks are now filled in.`
      );
      setAnswers({});
      onSaved(newContent);
    } catch {
      setError("Network error — please try again.");
    }
    setSaving(false);
  }

  function renderField(f: { key: string; label: string; hint: string }) {
    return (
      <div key={f.key} className="lf-info-field">
        <label className="lf-info-label" htmlFor={`wsd-${draftId}-${f.key}`}>
          {f.label}
          {f.hint && <span className="lf-info-hint">{f.hint}</span>}
        </label>
        <input
          id={`wsd-${draftId}-${f.key}`}
          className="lf-info-input"
          type="text"
          value={answers[f.key] ?? ""}
          onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
          placeholder="Type your answer…"
        />
      </div>
    );
  }

  const fewFields = fields.length <= 2;

  return (
    <details className="lf-info-needed" open={fewFields}>
      <summary className="lf-info-needed-head">
        <span className="lf-info-needed-title">Fill in blanks for &ldquo;{draftTitle}&rdquo;</span>
        <span className="lf-info-needed-sub">
          {required.length > 0 && `${required.length} required`}
          {required.length > 0 && optional.length > 0 && " · "}
          {optional.length > 0 && `${optional.length} optional`}
          {" — tap to fill in what you can"}
        </span>
      </summary>

      <div className="lf-info-needed-body">
        {required.length > 0 && (
          <div className="lf-info-group">
            <div className="lf-info-group-label">Required to finalize</div>
            {required.map(renderField)}
          </div>
        )}

        {optional.length > 0 && (
          <div className="lf-info-group">
            <div className="lf-info-group-label">Helpful — can be added later</div>
            {optional.map(renderField)}
          </div>
        )}

        <div className="lf-info-actions">
          <button
            className="lf-info-save"
            onClick={save}
            disabled={saving || filledCount === 0}
          >
            {saving ? "Saving…" : `Fill in ${filledCount || ""} blank${filledCount === 1 ? "" : "s"}`.trim()}
          </button>
          {message && <span className="lf-info-msg">{message}</span>}
          {error && <span className="lf-info-error">{error}</span>}
        </div>
      </div>
    </details>
  );
}
