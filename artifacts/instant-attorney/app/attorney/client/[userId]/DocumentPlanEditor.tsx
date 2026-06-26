"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PlanItem, PlanStatus } from "@/lib/next-step";

const STATUS_LABEL: Record<PlanStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  sent: "With attorney",
  changes_requested: "Changes requested",
  approved: "Approved",
};

// Attorney control over the file's document plan. The AI ranks the documents
// (priority order); this lets the attorney override which one is the client's
// lead (most-important) document, or revert to the AI's pick. Plan-based files
// override by stable key; legacy files override by wizard type.
export default function DocumentPlanEditor({
  caseFileId,
  items,
  usesPlan,
  overridden,
  rationale,
}: {
  caseFileId: string;
  items: PlanItem[];
  usesPlan: boolean;
  overridden: boolean;
  rationale?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function setLead(item: PlanItem | null) {
    setPending(item?.key ?? "__reset__");
    setError("");
    try {
      const payload = usesPlan
        ? { leadKey: item?.key ?? null }
        : { lead: item?.wizard ?? null };
      const res = await fetch(`/api/attorney/case-files/${caseFileId}/document-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? "Update failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="atty-case-subsection">
      <h3 className="atty-case-subtitle">
        Document plan ({items.length})
        {overridden && <span className="atty-plan-override-tag">manual lead</span>}
      </h3>
      <p className="atty-plan-help">
        The client is guided to finish the <strong>lead</strong> document first.
        AI ranked these in order; set a different lead if you&apos;d prefer the client
        start elsewhere.
      </p>
      {rationale && (
        <p className="atty-plan-rationale">AI rationale: {rationale}</p>
      )}
      <ol className="atty-plan-list">
        {items.map((item) => (
          <li
            key={item.key}
            className={`atty-plan-item${item.isLead ? " atty-plan-item-lead" : ""}`}
          >
            <span className="atty-plan-num">{item.priority}</span>
            <span className="atty-plan-label">
              {item.label}
              {item.isLead && <span className="atty-plan-lead-tag">Lead</span>}
            </span>
            <span className="atty-plan-status">{STATUS_LABEL[item.status]}</span>
            {!item.isLead && (
              <button
                className="atty-plan-btn"
                disabled={pending !== null}
                onClick={() => setLead(item)}
              >
                {pending === item.key ? "Setting…" : "Make lead"}
              </button>
            )}
          </li>
        ))}
      </ol>
      {overridden && (
        <button
          className="atty-plan-reset"
          disabled={pending !== null}
          onClick={() => setLead(null)}
        >
          {pending === "__reset__" ? "Resetting…" : "Reset to AI's pick"}
        </button>
      )}
      {error && <p className="atty-plan-error">{error}</p>}
    </div>
  );
}
