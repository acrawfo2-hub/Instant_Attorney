import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { docTypeLabel } from "@/lib/types";
import type { Document, CaseFile, Profile } from "@/lib/types";
import AutoReviewToggle from "@/components/AutoReviewToggle";
import AttorneyFileLog from "@/components/AttorneyFileLog";
import ConsultRequestQueue, { type ConsultRequestRow } from "@/components/ConsultRequestQueue";
import LogoutButton from "@/components/LogoutButton";

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

export default async function AttorneyPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.is_attorney) redirect("/dashboard");

  const [{ data: documents }, { data: caseFiles }, { data: consultRequests }] = await Promise.all([
    db
      .from("documents")
      .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
      .order("created_at", { ascending: false })
      .limit(100),
    db
      .from("case_files")
      .select("*, profiles!case_files_user_id_fkey(*)")
      .neq("status", "archived")
      .order("updated_at", { ascending: false })
      .limit(200),
    db
      .from("consult_requests")
      .select("*, profiles!consult_requests_user_id_fkey(*), case_files(*)")
      .in("status", ["pending", "attorney_proposed", "confirmed"])
      .order("created_at", { ascending: false }),
  ]);

  const docs = (documents ?? []) as DocumentWithRelations[];
  const pending = docs
    .filter((d) => d.status === "pending_review" && !d.parent_document_id)
    .sort((a, b) =>
      new Date(a.submitted_at ?? a.created_at).getTime() -
      new Date(b.submitted_at ?? b.created_at).getTime());

  const files = (caseFiles ?? []) as (CaseFile & { profiles: Profile | null })[];
  const consults = (consultRequests ?? []) as ConsultRequestRow[];

  return (
    <div className="atty-shell">
      <header className="atty-header">
        <div className="atty-header-inner">
          <div className="atty-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Attorney Dashboard</span>
          </div>
          <div className="atty-header-right">
            <span className="atty-name">{profile.full_name ?? profile.email}</span>
            <AutoReviewToggle initial={profile.auto_document_review ?? true} />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="atty-main">
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
                    <td>{doc.profiles?.full_name ?? doc.profiles?.email ?? "Unknown"}</td>
                    <td className="atty-td-doc">
                      {docTypeLabel(doc.doc_type)}: {doc.title}
                      {doc.review_status === "reviewing" && (
                        <span className="atty-inline-badge">AI reviewing…</span>
                      )}
                      {doc.review_status === "review_ready" && (
                        <span className="atty-inline-badge atty-inline-badge-ready">Review memo ready</span>
                      )}
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

        <section className="atty-section">
          <h2 className="atty-section-title">
            Client Files
            {files.length > 0 && <span className="atty-count">{files.length}</span>}
          </h2>
          <AttorneyFileLog files={files} />
        </section>
      </main>
    </div>
  );
}
