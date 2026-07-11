import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { docTypeLabel, personDisplayName } from "@/lib/types";
import type { Document, CaseFile, Profile } from "@/lib/types";
import ConsultRequestQueue, { type ConsultRequestRow } from "@/components/ConsultRequestQueue";

export const dynamic = "force-dynamic";

interface DocumentWithRelations extends Document {
  case_files: CaseFile;
  profiles: Profile;
}

function ReviewClock({ submittedAt }: { submittedAt: string | null }) {
  if (!submittedAt) return <span className="atty-clock atty-clock-ok">—</span>;

  const deadline = new Date(new Date(submittedAt).getTime() + 48 * 60 * 60 * 1000);
  const msLeft = deadline.getTime() - Date.now();

  if (msLeft <= 0) {
    return <span className="atty-clock atty-clock-overdue">Overdue</span>;
  }

  const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
  const minutesLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
  const isUrgent = hoursLeft < 8;

  return (
    <span className={`atty-clock ${isUrgent ? "atty-clock-urgent" : "atty-clock-ok"}`}>
      {hoursLeft}h {minutesLeft}m
    </span>
  );
}

function matterLabel(cf: CaseFile | null | undefined) {
  if (!cf) return "—";
  const t = cf.matter_type ?? "Unclassified";
  return cf.matter_subtype ? `${t} — ${cf.matter_subtype}` : t;
}

// Pure triage: only what needs the attorney's attention right now. The full
// client roster lives on the Clients tab; the full consult picture (including
// completed ones) lives on the Consults tab.
export default async function AttorneyDashboardPage() {
  const db = createServiceClient();

  const [{ data: documents }, { data: consultRequests }] = await Promise.all([
    db
      .from("documents")
      .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
      .eq("status", "pending_review")
      .is("parent_document_id", null)
      .order("submitted_at", { ascending: true })
      .limit(100),
    db
      .from("consult_requests")
      .select("*, profiles!consult_requests_user_id_fkey(*), case_files(*)")
      .in("status", ["pending", "attorney_proposed", "confirmed"])
      .order("created_at", { ascending: false }),
  ]);

  const pending = (documents ?? []) as DocumentWithRelations[];
  const consults = (consultRequests ?? []) as ConsultRequestRow[];

  return (
    <>
      <section className="atty-section">
        <h2 className="atty-section-title">
          Drafts to Review
          {pending.length > 0 && <span className="atty-count">{pending.length}</span>}
          <span className="atty-section-hint">48-hour SLA · soonest deadline first</span>
        </h2>

        {pending.length === 0 ? (
          <div className="atty-empty">No drafts pending review</div>
        ) : (
          <table className="atty-table">
            <thead>
              <tr><th>SLA</th><th>Client</th><th>Document</th><th>Matter</th><th>Submitted</th><th /></tr>
            </thead>
            <tbody>
              {pending.map((doc) => (
                <tr key={doc.id} className="atty-tr-urgent">
                  <td className="atty-td-sla"><ReviewClock submittedAt={doc.submitted_at ?? null} /></td>
                  <td>{personDisplayName(doc.profiles)}</td>
                  <td className="atty-td-doc">
                    {docTypeLabel(doc.doc_type)}: {doc.title}
                  </td>
                  <td className="atty-td-matter">{matterLabel(doc.case_files)}</td>
                  <td className="atty-td-muted">
                    {doc.submitted_at ? new Date(doc.submitted_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="atty-td-arrow">
                    <Link href={`/attorney/review/${doc.id}`} className="atty-row-link">Review →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="atty-section">
        <h2 className="atty-section-title">
          Consults
          {consults.length > 0 && <span className="atty-count">{consults.length}</span>}
          <span className="atty-section-hint">client requests · confirm times &amp; upcoming calls</span>
        </h2>
        <ConsultRequestQueue requests={consults} />
      </section>
    </>
  );
}
