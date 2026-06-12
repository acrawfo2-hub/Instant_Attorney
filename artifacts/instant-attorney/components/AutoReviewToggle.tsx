"use client";

import { useState } from "react";

export default function AutoReviewToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    const next = !enabled;
    try {
      const res = await fetch("/api/attorney/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ auto_document_review: next }),
      });
      if (res.ok) setEnabled(next);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="atty-toggle-row">
      <div className="atty-toggle-label">
        <span>Auto Critical Review</span>
        <span className="atty-toggle-hint">When on, AI generates a critical review memo automatically on each submission. Turn off to run reviews manually.</span>
      </div>
      <button
        className={`atty-toggle-btn${enabled ? " atty-toggle-btn-on" : ""}`}
        onClick={toggle}
        disabled={saving}
        aria-pressed={enabled}
      >
        {saving ? "…" : enabled ? "On" : "Off"}
      </button>
    </div>
  );
}
