"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AccountMenu from "@/components/AccountMenu";
import ConsultNotepad from "@/components/ConsultNotepad";
import type { CaseFile, ConsultNote, ConsultRecording, ConsultRequest, Profile } from "@/lib/types";

type SessionMode = "client" | "attorney" | "reviewer";

interface Props {
  mode: SessionMode;
  consult: ConsultRequest;
  caseFile: CaseFile | null;
  clientProfile: Profile | null;
  notes: ConsultNote[];
  recordings: ConsultRecording[];
}

function formatConsultTime(iso: string | null): string {
  if (!iso) return "Not scheduled";
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const MODE_BADGE: Record<SessionMode, string> = {
  client: "Consult",
  attorney: "Live Session",
  reviewer: "Session Review",
};

export default function ConsultSessionView({
  mode,
  consult,
  caseFile,
  clientProfile,
  notes,
  recordings,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backHref = mode === "client" ? "/dashboard" : caseFile ? `/attorney/file/${caseFile.id}` : "/attorney";
  const backLabel = mode === "client" ? "All Files" : "Back to file";

  const title =
    caseFile?.title ||
    (caseFile?.matter_subtype ? caseFile.matter_subtype.replace(/_/g, " ") : null) ||
    "Consult Session";

  async function postAction(action: "start" | "end") {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/attorney/consult/${consult.id}/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Request failed");
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="lf-shell">
      <header className="lf-header">
        <Link href={backHref} className="lf-header-logo">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {backLabel}
        </Link>

        <div className="lf-header-center">
          <span className="lf-header-title">{title}</span>
          <span className="lf-badge">{MODE_BADGE[mode]}</span>
        </div>

        <div className="lf-header-right">
          <AccountMenu />
        </div>
      </header>

      <main className="lf-main">
        <div className="lf-grid">
          <div className="lf-card lf-card-full">
            <div className="lf-card-label">Scheduled time</div>
            <div className="lf-card-value">{formatConsultTime(consult.confirmed_time)}</div>
            {mode !== "client" && clientProfile && (
              <div className="lf-card-meta">
                {clientProfile.full_name ?? clientProfile.email}
                {consult.client_phone ? ` · ${consult.client_phone}` : ""}
              </div>
            )}
          </div>

          {mode === "attorney" && (
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Session</div>
              {consult.session_started_at ? (
                <>
                  <div className="lf-card-meta">Started {formatConsultTime(consult.session_started_at)}</div>
                  <button className="lf-begin-btn" disabled={pending} onClick={() => postAction("end")}>
                    {pending ? "Ending…" : "End session"}
                  </button>
                </>
              ) : (
                <button className="lf-begin-btn" disabled={pending} onClick={() => postAction("start")}>
                  {pending ? "Starting…" : "Start session"}
                </button>
              )}
              {error && <div className="lf-session-error">{error}</div>}
            </div>
          )}

          {mode === "reviewer" && (
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Session</div>
              <div className="lf-card-meta">
                {consult.session_started_at && consult.session_ended_at
                  ? `${formatConsultTime(consult.session_started_at)} – ${formatConsultTime(consult.session_ended_at)}`
                  : "Ended"}
              </div>
            </div>
          )}

          {mode !== "client" && (
            <ConsultNotepad consultId={consult.id} initialNotes={notes} editable={mode === "attorney"} />
          )}

          {mode !== "client" && (
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Recording</div>
              {recordings.length === 0 ? (
                <div className="lf-card-meta">No recording yet.</div>
              ) : (
                recordings.map((r) => (
                  <div key={r.id} className="lf-card-meta">
                    {r.transcript_status === "ready" ? "Transcribed" : r.transcript_status}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
