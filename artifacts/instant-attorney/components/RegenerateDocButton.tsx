"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Per-document, client-only "Regenerate" action shown when a draft is out of
// date (the file's facts / What-If answers changed after it was written).
// Deliberate and one-at-a-time — there is no bulk update and no auto-regenerate.
// Runs the full drafting pipeline, so it can take a minute or two; we
// give it a generous client timeout and surface a friendly error on failure.
const REGEN_TIMEOUT_MS = 290_000;

export default function RegenerateDocButton({
  documentId,
  subtle = false,
}: {
  documentId: string;
  subtle?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleRegenerate() {
    if (busy) return;
    setBusy(true);
    setError("");

    const abort = new AbortController();
    const timeoutId = setTimeout(() => abort.abort(), REGEN_TIMEOUT_MS);

    try {
      const res = await fetch(`/api/documents/${documentId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || `Server error ${res.status}`);
      }
      // Re-render the server component so the refreshed draft + cleared "out of
      // date" flag appear.
      router.refresh();
    } catch (err) {
      const msg =
        err instanceof DOMException && err.name === "AbortError"
          ? "That took too long. Please try again."
          : err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.";
      setError(msg);
      setBusy(false);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return (
    <div className={subtle ? "lf-doc-regen lf-doc-regen-subtle" : "lf-doc-regen"}>
      <button
        type="button"
        className="lf-doc-regen-btn"
        onClick={handleRegenerate}
        disabled={busy}
      >
        {busy ? "Regenerating…" : "Regenerate with latest info"}
      </button>
      {error && <span className="lf-doc-regen-error">{error}</span>}
    </div>
  );
}
