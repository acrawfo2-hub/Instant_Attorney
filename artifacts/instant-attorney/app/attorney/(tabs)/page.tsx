import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { docTypeLabel, personDisplayName } from "@/lib/types";
import type { Document, CaseFile, Profile, LegalStrategy } from "@/lib/types";
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

function slaMsLeft(submittedAt: string | null | undefined): number {
  if (!submittedAt) return Number.POSITIVE_INFINITY;
  return new Date(submittedAt).getTime() + 48 * 60 * 60 * 1000 - Date.now();
}

function recommendConsult(doc: DocumentWithRelations): boolean {
  const strategy = doc.case_files?.legal_strategy as LegalStrategy | null | undefined;
  return !!strategy?.recommend_consult;
}

/** Triage: overdue first, then consult-recommended, then soonest SLA. */
function triageScore(doc: DocumentWithRelations): number {
  const left = slaMsLeft(doc.submitted_at);
  const overdueBoost = left <= 0 ? -1_000_000_000 : 0;
  const consultBoost = recommendConsult(doc) ? -500_000_000 : 0;
  return overdueBoost + consultBoost + left;
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

  const pending = ([...(documents ?? [])] as DocumentWithRelations[]).sort(
    (a, b) => triageScore(a) - triageScore(b),
  );
  const consults = (consultRequests ?? []) as ConsultRequestRow[];

  return (
    <>
      <section className="atty-section">
        <h2 className="atty-section-title">
          Drafts to Review
          {pending.length > 0 && <span className="atty-count">{pending.length}</span>}
          <span className="atty-section-hint">
            48-hour SLA · overdue first · consult-recommended next
          </span>
        </h2>

        {pending.length === 0 ? (
          <div className="atty-empty">No drafts pending review</div>
        ) : (
          <table className="atty-table">
            <thead>
              <tr>
                <th>SLA</th>
                <th>Flags</th>
                <th>Client</th>
                <th>Document</th>
                <th>Matter</th>
                <th>Submitted</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pending.map((doc) => {
                const consultRec = recommendConsult(doc);
                const overdue = slaMsLeft(doc.submitted_at) <= 0;
                return (
                  <tr
                    key={doc.id}
                    className={
                      overdue ? "atty-tr-overdue" : consultRec ? "atty-tr-consult" : "atty-tr-urgent"
                    }
                  >
                    <td className="atty-td-sla">
                      <ReviewClock submittedAt={doc.submitted_at ?? null} />
                    </td>
                    <td className="atty-td-flags">
                      {overdue && <span className="atty-flag atty-flag--overdue">Overdue</span>}
                      {consultRec && (
                        <span className="atty-flag atty-flag--consult" title="Living File recommends a consult">
                          Consult rec.
                        </span>
                      )}
                      {!overdue && !consultRec && <span className="atty-td-muted">—</span>}
                    </td>
                    <td>{personDisplayName(doc.profiles)}</td>
                    <td className="atty-td-doc">
                      {docTypeLabel(doc.doc_type)}: {doc.title}
                    </td>
                    <td className="atty-td-matter">{matterLabel(doc.case_files)}</td>
                    <td className="atty-td-muted">
                      {doc.submitted_at ? new Date(doc.submitted_at).toLocaleDateString() : "—"}
                    </td>
                    <td className="atty-td-arrow">
                      <Link href={`/attorney/review/${doc.id}`} className="atty-row-link">
                        Review →
                      </Link>
                    </td>
                  </tr>
                );
              })}
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
