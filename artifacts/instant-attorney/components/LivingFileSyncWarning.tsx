"use client";
import { useState } from "react";

export default function LivingFileSyncWarning({ documentId }: { documentId: string }) {
  const [retrying, setRetrying] = useState(false);
  const [reconciled, setReconciled] = useState(false);
  if (reconciled) return null;
  return <div role="alert" className="my-4 rounded-lg border-2 border-amber-500 bg-amber-50 p-4 text-amber-950">
    <strong>Living File synchronization needs attention.</strong>{" "}
    The document is safely saved and can continue through review, but its outstanding placeholders may not yet appear in the Living File.
    <button className="ml-3 rounded bg-amber-900 px-3 py-1 text-sm font-semibold text-white disabled:opacity-60" disabled={retrying}
      onClick={async () => { setRetrying(true); const r = await fetch(`/api/documents/${documentId}/sync-living-file`, { method: "POST" }); setRetrying(false); if (r.ok) setReconciled(true); }}>
      {retrying ? "Reconciling…" : "Retry reconciliation"}
    </button>
  </div>;
}
