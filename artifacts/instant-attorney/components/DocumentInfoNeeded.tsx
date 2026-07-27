"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { placeholderFields } from "@/lib/wizard-parsing";

// Client-facing "Information needed" panel. Lists the [[blanks]] still open in a
// document as labeled inputs; saving fills them directly into the document text
// (deterministic substitution server-side — no model call, approved language is
// never touched). Renders nothing when the draft has no remaining blanks.
export default function DocumentInfoNeeded({
  documentId,
  draftText,
  documentTitle,
}: {
  documentId: string;
  draftText: string;
  documentTitle: string;
}) {
  const router = useRouter();
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
      const res = await fetch(`/api/documents/${documentId}/fill-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not save your answers.");
        setSaving(false);
        return;
      }
      setMessage(
        data.remaining > 0
          ? `Saved. ${data.filled} item${data.filled === 1 ? "" : "s"} added — ${data.remaining} still open.`
          : `Saved. Everything we needed is now in your document.`
      );
      setAnswers({});
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    }
    setSaving(false);
  }

  function renderField(f: { key: string; label: string; hint: string }) {
    return (
      <div key={f.key} className="lf-info-field">
        <label className="lf-info-label" htmlFor={`info-${f.key}`}>
          {f.label}
          {f.hint && <span className="lf-info-hint">{f.hint}</span>}
        </label>
        <input
          id={`info-${f.key}`}
          className="lf-info-input"
          type="text"
          value={answers[f.key] ?? ""}
          onChange={(e) => setAnswers((a) => ({ ...a, [f.key]: e.target.value }))}
          placeholder="Type your answer…"
        />
      </div>
    );
  }

  // Collapsed by default so a draft with many blanks doesn't swallow the whole
  // file. The summary states exactly what's open, so nothing is hidden — it's one
  // tap to fill. Opens automatically if the only thing left is a couple of blanks.
  const fewFields = fields.length <= 2;

  return (
    <details className="lf-info-needed" open={fewFields}>
      <summary className="lf-info-needed-head">
        <span className="lf-info-needed-title">Information needed for &ldquo;{documentTitle}&rdquo;</span>
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
          <button className="lf-info-save" onClick={save} disabled={saving || filledCount === 0}>
            {saving ? "Saving…" : `Add ${filledCount || ""} to document`.trim()}
          </button>
          {message && <span className="lf-info-msg">{message}</span>}
          {error && <span className="lf-info-error">{error}</span>}
        </div>
      </div>
    </details>
  );
}
