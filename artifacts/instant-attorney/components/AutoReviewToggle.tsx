"use client";

import { useState } from "react";

export default function AutoReviewToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    if (saving) return;
    const next = !enabled;
    setSaving(true);
    setError(false);
    setEnabled(next); // optimistic
    try {
      const res = await fetch("/api/attorney/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_document_review: next }),
      });
      if (!res.ok) {
        setEnabled(!next); // revert
        setError(true);
      }
    } catch {
      setEnabled(!next); // revert
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="atty-toggle-row">
      <div className="atty-toggle-label">
        <span>Auto Critical Review</span>
        <span className="atty-toggle-hint">
          {error
            ? "Couldn't save — please try again."
            : "When on, AI writes a critical review memo automatically on each submission. Turn off to run reviews manually."}
        </span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label="Auto Critical Review"
        className={`atty-switch${enabled ? " atty-switch-on" : ""}`}
        onClick={toggle}
        disabled={saving}
      >
        <span className="atty-switch-track">
          <span className="atty-switch-thumb" />
        </span>
        <span className="atty-switch-state">{saving ? "…" : enabled ? "On" : "Off"}</span>
      </button>
    </div>
  );
}
