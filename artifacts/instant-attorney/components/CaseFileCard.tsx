"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseFile } from "@/lib/types";

interface CaseFileCardProps {
  file: CaseFile;
  mode: "active" | "archived";
  pendingDocs: number;
}

export default function CaseFileCard({ file, mode, pendingDocs }: CaseFileCardProps) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const title = file.title
    || (file.matter_subtype ? file.matter_subtype.replace(/_/g, " ") : null)
    || "Intake in progress";

  const summary = file.summary
    ? file.summary.slice(0, 140) + (file.summary.length > 140 ? "…" : "")
    : null;

  const nextAction = file.next_action ?? null;

  const dateStr = new Date(file.opened_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  const daysLeft = file.archive_at
    ? Math.max(0, Math.ceil((new Date(file.archive_at).getTime() - Date.now()) / 86_400_000))
    : null;

  async function callAction(path: string) {
    setActing(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Something went wrong"); return; }
      router.refresh();
    } catch {
      setError("Network error — please try again");
    } finally {
      setActing(false);
    }
  }

  const isQuickConsult = file.file_type === "quick_consult";
  const matterLabel = file.matter_type === "reactive"
    ? "Reactive" : file.matter_type === "preventive"
    ? "Preventive" : null;

  const typeIcon = isQuickConsult ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );

  return (
    <div className={`card${mode === "archived" ? " card--archived" : ""}${isQuickConsult ? " card--qc" : ""}`}>

      {/* Header */}
      <div className="card__header">
        <div className="card__icon">{typeIcon}</div>
        <div className="card__meta">
          <h3 className="card__title">{title}</h3>
          <div className="card__tags">
            {isQuickConsult && <span className="card__tag card__tag--qc">Quick Consult</span>}
            {matterLabel && <span className="card__tag">{matterLabel}</span>}
            {mode === "archived" && daysLeft !== null && (
              <span className="card__tag card__tag--expiry">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                Deletes in {daysLeft}d
              </span>
            )}
          </div>
        </div>
        <span className="card__date">{dateStr}</span>
      </div>

      {/* Body */}
      {(summary || nextAction) && (
        <div className="card__body">
          {summary && <p className="card__summary">{summary}</p>}
          {nextAction && (
            <div className="card__next">
              <span className="card__next-label">Next step</span>
              <span className="card__next-text">{nextAction}</span>
            </div>
          )}
        </div>
      )}

      {/* Status strip — docs under review + consult */}
      {mode === "active" && (
        <div className="card__status-strip">
          {/* Pending docs */}
          <div className={`card__status-item${pendingDocs > 0 ? " card__status-item--active" : ""}`}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>
            </svg>
            {pendingDocs > 0
              ? <><strong>{pendingDocs}</strong> doc{pendingDocs !== 1 ? "s" : ""} awaiting 48-hr review</>
              : <span>No docs pending review</span>
            }
          </div>

          {/* Consult status — placeholder until consult scheduling is built */}
          <div className="card__status-item card__status-item--muted">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            <span>No consult scheduled</span>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="card__footer">
        {mode === "active" ? (
          archiveConfirm ? (
            /* Archive confirmation */
            <div className="card__archive-confirm">
              <div className="card__archive-warn">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                This file will be scheduled for deletion in 30 days. Are you sure?
              </div>
              <div className="card__archive-confirm-btns">
                <button
                  className="card__btn card__btn--danger-confirm"
                  onClick={() => callAction(`/api/case-files/${file.id}/archive`)}
                  disabled={acting}
                >
                  {acting ? "Archiving…" : "Yes, Archive"}
                </button>
                <button
                  className="card__btn card__btn--outline"
                  onClick={() => setArchiveConfirm(false)}
                  disabled={acting}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Primary: View File */}
              <a href={`/dashboard/${file.id}`} className="card__btn card__btn--primary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                View File
              </a>

              {/* Secondary: Continue Chat */}
              <a href={`/chat?caseFileId=${file.id}`} className="card__btn card__btn--outline">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                Continue Chat
              </a>

              {/* Tertiary: Schedule Consult */}
              <button className="card__btn card__btn--outline card__btn--coming-soon" disabled title="Coming soon">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                Schedule Consult
              </button>

              {/* Danger: Archive */}
              <button
                className="card__btn card__btn--ghost card__btn--danger"
                onClick={() => setArchiveConfirm(true)}
                disabled={acting}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="21 8 21 21 3 21 3 8"/>
                  <rect x="1" y="3" width="22" height="5"/>
                  <line x1="10" y1="12" x2="14" y2="12"/>
                </svg>
                Archive
              </button>
            </>
          )
        ) : (
          <button
            className="card__btn card__btn--primary"
            onClick={() => callAction(`/api/case-files/${file.id}/restore`)}
            disabled={acting}
          >
            {acting ? "…" : "Restore File"}
          </button>
        )}
      </div>

      {error && <p className="card__error">{error}</p>}
    </div>
  );
}
