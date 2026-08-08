import React from "react";
import { computeDocket, DOCKET_CAVEAT, type DocketEntry } from "@/lib/docket";
import type { FactItem } from "@/lib/types";

// ── Key deadlines — the file's docket ────────────────────────────────────────
//
// An expert attorney's first discipline is the calendar. This renders the
// deterministic docket (lib/docket.ts) computed from dated facts: deadline,
// countdown, urgency color. Server component, no model call — it renders
// instantly on every file load and self-updates as the extractor records new
// dated events. Shown to both the client and the attorney.

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function countdown(e: DocketEntry): string {
  if (e.daysRemaining < 0) {
    const d = -e.daysRemaining;
    return `passed ${d} day${d === 1 ? "" : "s"} ago`;
  }
  if (e.daysRemaining === 0) return "today";
  return `${e.daysRemaining} day${e.daysRemaining === 1 ? "" : "s"} left`;
}

export default function KeyDeadlines({
  facts,
  jurisdiction = null,
}: {
  facts: FactItem[];
  jurisdiction?: string | null;
}) {
  const entries = computeDocket(facts, new Date(), jurisdiction);
  if (!entries.length) return null;

  const hasPressing = entries.some((e) => e.urgency === "expired" || e.urgency === "critical");

  return (
    <section
      className={`lf-card lf-card-full lf-docket${hasPressing ? " lf-docket-pressing" : ""}`}
      aria-label="Key deadlines"
    >
      <div className="lf-docket-head">
        <h2 className="lf-docket-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Key deadlines
        </h2>
        <span className="lf-docket-sub">Computed from the dates on your file</span>
      </div>

      <ul className="lf-docket-list">
        {entries.map((e) => (
          <li key={e.id} className={`lf-docket-item lf-docket-${e.urgency}`}>
            <div className="lf-docket-when">
              <span className="lf-docket-date">{fmtDate(e.deadlineDate)}</span>
              <span className={`lf-docket-count lf-docket-count-${e.urgency}`}>{countdown(e)}</span>
            </div>
            <div className="lf-docket-body">
              <div className="lf-docket-label">{e.label}</div>
              <div className="lf-docket-explain">{e.explain}</div>
              <div className="lf-docket-basis">
                {e.basis} · from {fmtDate(e.triggerDate)}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="lf-docket-caveat">{DOCKET_CAVEAT}</p>
    </section>
  );
}
