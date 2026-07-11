"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AccountMenu from "@/components/AccountMenu";
import ConsultNotepad from "@/components/ConsultNotepad";
import ConsultRecorder from "@/components/ConsultRecorder";
import ConsultCloseoutEditor from "@/components/ConsultCloseoutEditor";
import ClientFileView from "@/components/ClientFileView";
import type {
  CaseFile,
  ConsultNote,
  ConsultRecording,
  ConsultRequest,
  Profile,
  FactItem,
  Document,
  RequestedAttachment,
  GovFormInstrument,
} from "@/lib/types";

type SessionMode = "client" | "attorney";

interface Props {
  mode: SessionMode;
  consult: ConsultRequest;
  caseFile: CaseFile | null;
  clientProfile: Profile | null;
  notes: ConsultNote[];
  recordings: ConsultRecording[];
  facts: FactItem[];
  documents: Document[];
  childDocuments: Document[];
  requestedAttachments: RequestedAttachment[];
  govForms: GovFormInstrument[];
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
  attorney: "Consult Session",
};

export default function ConsultSessionView({
  mode,
  consult,
  caseFile,
  clientProfile,
  notes,
  recordings,
  facts,
  documents,
  childDocuments,
  requestedAttachments,
  govForms,
}: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const backHref = mode === "client" ? "/dashboard" : caseFile ? `/attorney/file/${caseFile.id}` : "/attorney";
  const backLabel = mode === "client" ? "All Files" : "Back to file";
  const showFile = mode === "attorney" && !!caseFile;

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
    <div className={`lf-shell${showFile ? " lf-session-wide" : ""}`}>
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
        <div className={showFile ? "lf-session-layout" : undefined}>
          <div className={showFile ? "lf-session-rail" : undefined}>
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
                  {consult.session_started_at && consult.session_ended_at ? (
                    <div className="lf-card-meta">
                      {formatConsultTime(consult.session_started_at)} – {formatConsultTime(consult.session_ended_at)}
                    </div>
                  ) : consult.session_started_at ? (
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

              {mode !== "client" && (
                <ConsultNotepad consultId={consult.id} initialNotes={notes} editable={mode === "attorney"} />
              )}

              {mode === "attorney" && (
                <ConsultRecorder
                  consultId={consult.id}
                  initialRecordings={recordings}
                  hasConsent={!!consult.recording_consent_at}
                />
              )}
            </div>
          </div>

          {showFile && caseFile && (
            <div className="lf-session-file">
              <ClientFileView
                caseFile={caseFile}
                facts={facts}
                documents={documents}
                childDocuments={childDocuments}
                requestedAttachments={requestedAttachments}
                govForms={govForms}
                mode="attorney"
                clientProfile={clientProfile ?? undefined}
              />
            </div>
          )}
        </div>

        {mode === "attorney" && caseFile && (
          <div className="lf-grid" style={{ marginTop: "1.5rem" }}>
            <ConsultCloseoutEditor
              consultId={consult.id}
              initialWrapUp={consult.wrap_up_draft}
              alreadySent={consult.status === "completed" && !!consult.wrap_up_submitted_at}
              submittedAt={consult.wrap_up_submitted_at}
            />
          </div>
        )}
      </main>
    </div>
  );
}
