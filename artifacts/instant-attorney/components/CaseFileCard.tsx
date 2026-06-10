"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CaseFile } from "@/lib/types";

interface CaseFileCardProps {
  file: CaseFile;
  mode: "active" | "archived";
}

export default function CaseFileCard({ file, mode }: CaseFileCardProps) {
  const router = useRouter();
  const [acting, setActing] = useState(false);
  const [error, setError] = useState("");

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
  const matterLabel = file.matter_type === "reactive" ? "Reactive" : file.matter_type === "preventive" ? "Preventive" : null;

  const typeIcon = isQuickConsult
    ? (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    )
    : (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );

  return (
    <div className={`card${mode === "archived" ? " card--archived" : ""}${isQuickConsult ? " card--qc" : ""}`}>
      {/* Card header */}
      <div className="card__header">
        <div className="card__icon">{typeIcon}</div>
        <div className="card__meta">
          <h3 className="card__title">{title}</h3>
          <div className="card__tags">
            {isQuickConsult && <span className="card__tag card__tag--qc">Quick Consult</span>}
            {matterLabel && <span className="card__tag">{matterLabel}</span>}
            {mode === "archived" && daysLeft !== null && (
              <span className="card__tag card__tag--expiry">Expires in {daysLeft}d</span>
            )}
          </div>
        </div>
        <span className="card__date">{dateStr}</span>
      </div>

      {/* Card body */}
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

      {/* Card footer */}
      <div className="card__footer">
        {mode === "active" ? (
          <>
            <a href={`/chat?caseFileId=${file.id}`} className="card__btn card__btn--primary">
              Continue
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </a>
            <a href={`/dashboard/${file.id}`} className="card__btn card__btn--outline">
              View File
            </a>
            <button
              className="card__btn card__btn--ghost"
              onClick={() => callAction(`/api/case-files/${file.id}/archive`)}
              disabled={acting}
            >
              {acting ? "…" : "Archive"}
            </button>
          </>
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
