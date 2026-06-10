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

  const subtitle = file.next_action
    || (file.summary ? file.summary.slice(0, 100) + (file.summary.length > 100 ? "…" : "") : null)
    || null;

  const dateStr = new Date(file.opened_at).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });

  const daysLeft = file.archive_at
    ? Math.max(0, Math.ceil((new Date(file.archive_at).getTime() - Date.now()) / 86_400_000))
    : null;

  async function callAction(path: string, body?: Record<string, unknown>) {
    setActing(true);
    setError("");
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
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

  return (
    <div className={`lf-file-card${isQuickConsult ? " lf-file-card-qc" : ""}${mode === "archived" ? " lf-file-card-archived" : ""}`}>
      <div className="lf-file-card-top">
        <div className="lf-file-card-info">
          <div className="lf-file-card-title">{title}</div>
          <div className="lf-file-card-badges">
            {isQuickConsult && <span className="lf-file-badge lf-file-badge-qc">Quick Consult</span>}
            {file.matter_type && (
              <span className="lf-file-badge">
                {file.matter_type === "reactive" ? "Reactive" : "Preventive"}
              </span>
            )}
            {mode === "archived" && daysLeft !== null && (
              <span className="lf-file-badge lf-file-badge-expiry">
                Deletes in {daysLeft}d
              </span>
            )}
          </div>
          {subtitle && <p className="lf-file-card-sub">{subtitle}</p>}
          <p className="lf-file-card-date">Opened {dateStr}</p>
        </div>

        <div className="lf-file-card-actions">
          {mode === "active" && (
            <>
              <a href={`/chat?caseFileId=${file.id}`} className="lf-file-btn lf-file-btn-primary">
                Continue
              </a>
              <a href={`/dashboard/${file.id}`} className="lf-file-btn">
                View File
              </a>
              <button
                className="lf-file-btn lf-file-btn-ghost"
                onClick={() => callAction(`/api/case-files/${file.id}/archive`)}
                disabled={acting}
              >
                {acting ? "…" : "Archive"}
              </button>
            </>
          )}
          {mode === "archived" && (
            <button
              className="lf-file-btn lf-file-btn-primary"
              onClick={() => callAction(`/api/case-files/${file.id}/restore`)}
              disabled={acting}
            >
              {acting ? "…" : "Restore"}
            </button>
          )}
        </div>
      </div>
      {error && <p className="lf-file-card-error">{error}</p>}
    </div>
  );
}
