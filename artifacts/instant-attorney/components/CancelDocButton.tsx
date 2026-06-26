"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-document "cancel" action: deletes an unwanted draft the client started but
// no longer wants (e.g. a Document Review they opened out of curiosity). It is
// deliberately two-step — a first click reveals an inline "Yes, delete / Keep it"
// confirm — so a draft is never thrown away by a stray tap. The matching server
// route only allows this while the document is still the client's to discard.
export default function CancelDocButton({
  documentId,
  label = "Cancel this document",
}: {
  documentId: string;
  label?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server error ${res.status}`);
      }
      // Re-render the server component so the removed draft disappears.
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setBusy(false);
      setConfirming(false);
    }
  }

  if (!confirming) {
    return (
      <div className="lf-doc-cancel">
        <button
          type="button"
          className="lf-doc-cancel-btn"
          onClick={() => setConfirming(true)}
        >
          {label}
        </button>
        {error && <span className="lf-doc-cancel-error">{error}</span>}
      </div>
    );
  }

  return (
    <div className="lf-doc-cancel lf-doc-cancel-confirm">
      <span className="lf-doc-cancel-q">
        Delete this document for good? This can&apos;t be undone.
      </span>
      <button
        type="button"
        className="lf-doc-cancel-yes"
        onClick={handleDelete}
        disabled={busy}
      >
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        className="lf-doc-cancel-no"
        onClick={() => setConfirming(false)}
        disabled={busy}
      >
        Keep it
      </button>
    </div>
  );
}
