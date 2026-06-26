"use client";

import { useRouter } from "next/navigation";
import { personDisplayName } from "@/lib/types";
import type { ConsultRequest, CaseFile, Profile } from "@/lib/types";
import ConsultActions from "@/components/ConsultActions";
import ConsultBriefPanel from "@/components/ConsultBriefPanel";

export type ConsultRequestRow = ConsultRequest & {
  profiles: Profile | null;
  case_files: CaseFile | null;
};

function fmtCST(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function clientName(row: ConsultRequestRow) {
  return personDisplayName(row.profiles, "Unknown client");
}

function matterLabel(cf: CaseFile | null | undefined) {
  if (!cf) return "—";
  const t = cf.matter_type ?? "Unclassified";
  return cf.matter_subtype ? `${t} — ${cf.matter_subtype}` : t;
}

function RequestCard({ row }: { row: ConsultRequestRow }) {
  const router = useRouter();

  return (
    <div className="atty-consult-card">
      <div className="atty-consult-header">
        <div>
          <div className="atty-consult-client">
            <button
              type="button"
              className="atty-client-link"
              onClick={() => router.push(`/attorney/client/${row.user_id}`)}
            >
              {clientName(row)}
            </button>
          </div>
          {row.client_phone && <div className="atty-consult-phone">{row.client_phone}</div>}
          <div className="atty-consult-matter">{matterLabel(row.case_files)}</div>
        </div>
        <span className={`ca-badge ca-badge-${row.status === "pending" ? "pending" : row.status}`}>
          {row.status === "pending" ? "Needs confirmation" :
           row.status === "attorney_proposed" ? "Awaiting client" :
           row.status === "confirmed" ? "Confirmed" : row.status}
        </span>
      </div>

      {row.notes && (
        <div className="atty-consult-notes">
          <span className="atty-consult-notes-label">Client note:</span> {row.notes}
        </div>
      )}

      {row.status === "pending" && (
        <>
          <div className="atty-consult-times">
            <strong>Client&apos;s proposed times:</strong>
            <ol>
              {row.proposed_times.map((t) => (
                <li key={t}>{fmtCST(t)}</li>
              ))}
            </ol>
          </div>
          <div className="atty-consult-actions">
            <ConsultActions consult={row} clientName={clientName(row)} />
          </div>
        </>
      )}

      {row.status === "attorney_proposed" && row.attorney_proposed_time && (
        <div className="atty-consult-times">
          You proposed <strong>{fmtCST(row.attorney_proposed_time)}</strong> — waiting for the client to accept or decline.
        </div>
      )}

      {row.status === "confirmed" && row.confirmed_time && (
        <>
          <div className="atty-consult-times">
            Scheduled for <strong>{fmtCST(row.confirmed_time)}</strong>
            {row.client_phone && <> · call {row.client_phone}</>}
          </div>
          {row.case_file_id && row.case_files && (
            <ConsultBriefPanel
              caseFileId={row.case_file_id}
              consultId={row.id}
              consultStatus={row.status}
              initialMemo={row.case_files.pre_consult_memo}
              autoGenerate
            />
          )}
          <div className="atty-consult-actions">
            <ConsultActions consult={row} clientName={clientName(row)} showCompleteHint />
          </div>
        </>
      )}
    </div>
  );
}

export default function ConsultRequestQueue({ requests }: { requests: ConsultRequestRow[] }) {
  const pending = requests.filter((r) => r.status === "pending");
  const awaitingClient = requests.filter((r) => r.status === "attorney_proposed");
  const upcoming = requests
    .filter((r) => r.status === "confirmed")
    .sort((a, b) =>
      new Date(a.confirmed_time ?? 0).getTime() - new Date(b.confirmed_time ?? 0).getTime());

  if (!requests.length) {
    return <div className="atty-empty">No consult requests yet</div>;
  }

  return (
    <div className="atty-consults">
      <div className="atty-consult-group">
        <div className="atty-consult-group-title">
          Needs confirmation
          {pending.length > 0 && <span className="atty-count">{pending.length}</span>}
        </div>
        {pending.length === 0 ? (
          <div className="atty-empty">No requests waiting for your confirmation</div>
        ) : (
          pending.map((row) => <RequestCard key={row.id} row={row} />)
        )}
      </div>

      <div className="atty-consult-group">
        <div className="atty-consult-group-title">
          Awaiting client
          {awaitingClient.length > 0 && <span className="atty-count">{awaitingClient.length}</span>}
        </div>
        {awaitingClient.length === 0 ? (
          <div className="atty-empty">No counter-proposals pending client response</div>
        ) : (
          awaitingClient.map((row) => <RequestCard key={row.id} row={row} />)
        )}
      </div>

      <div className="atty-consult-group">
        <div className="atty-consult-group-title">
          On the schedule
          {upcoming.length > 0 && <span className="atty-count">{upcoming.length}</span>}
        </div>
        {upcoming.length === 0 ? (
          <div className="atty-empty">No upcoming confirmed consults</div>
        ) : (
          upcoming.map((row) => <RequestCard key={row.id} row={row} />)
        )}
      </div>
    </div>
  );
}
