import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WIZARD_LABELS } from "@/lib/types";
import type { Document, CaseFile, Profile } from "@/lib/types";

interface DocumentWithRelations extends Document {
  case_files: CaseFile;
  profiles: Profile;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  changes_requested: "Changes Requested",
  delivered: "Delivered",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "atty-badge-gray",
  pending_review: "atty-badge-amber",
  approved: "atty-badge-green",
  changes_requested: "atty-badge-blue",
  delivered: "atty-badge-gray",
};

function ReviewClock({ submittedAt }: { submittedAt: string | null }) {
  if (!submittedAt) return null;

  const submitted = new Date(submittedAt);
  const deadline = new Date(submitted.getTime() + 48 * 60 * 60 * 1000);
  const now = new Date();
  const msLeft = deadline.getTime() - now.getTime();

  if (msLeft <= 0) {
    return <span className="atty-clock atty-clock-overdue">Overdue</span>;
  }

  const hoursLeft = Math.floor(msLeft / (1000 * 60 * 60));
  const minutesLeft = Math.floor((msLeft % (1000 * 60 * 60)) / (1000 * 60));
  const isUrgent = hoursLeft < 8;

  return (
    <span className={`atty-clock ${isUrgent ? "atty-clock-urgent" : "atty-clock-ok"}`}>
      {hoursLeft}h {minutesLeft}m left
    </span>
  );
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

  const { data: documents } = await db
    .from("documents")
    .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
    .order("created_at", { ascending: false })
    .limit(100);

  const { data: caseFiles } = await db
    .from("case_files")
    .select("*, profiles!case_files_user_id_fkey(*)")
    .eq("status", "open")
    .order("updated_at", { ascending: false })
    .limit(50);

  const docs = (documents ?? []) as DocumentWithRelations[];
  const pending = docs.filter((d) => d.status === "pending_review");
  const others = docs.filter((d) => d.status !== "pending_review");

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
          <span className="atty-name">{profile.full_name ?? profile.email}</span>
        </div>
      </header>

      <main className="atty-main">
        {/* Pending Review — 48-hour clock */}
        <section className="atty-section">
          <h2 className="atty-section-title">
            Under Review
            {pending.length > 0 && <span className="atty-count">{pending.length}</span>}
            <span className="atty-section-hint">48-hour SLA</span>
          </h2>

          {pending.length === 0 ? (
            <div className="atty-empty">No documents pending review</div>
          ) : (
            <div className="atty-doc-list">
              {pending.map((doc) => (
                <Link key={doc.id} href={`/attorney/review/${doc.id}`} className="atty-doc-card atty-doc-card-urgent">
                  <div className="atty-doc-header">
                    <span className="atty-doc-type">{WIZARD_LABELS[doc.doc_type] ?? doc.doc_type}</span>
                    <div className="atty-doc-header-right">
                      <ReviewClock submittedAt={doc.submitted_at ?? null} />
                      <span className={`atty-badge ${STATUS_COLORS[doc.status]}`}>{STATUS_LABELS[doc.status]}</span>
                    </div>
                  </div>
                  <div className="atty-doc-title">{doc.title}</div>
                  <div className="atty-doc-meta">
                    <span>{doc.profiles?.full_name ?? doc.profiles?.email ?? "Unknown client"}</span>
                    <span>
                      {doc.submitted_at
                        ? `Submitted ${new Date(doc.submitted_at).toLocaleString()}`
                        : `Created ${new Date(doc.created_at).toLocaleDateString()}`}
                    </span>
                  </div>
                  <div className="atty-doc-matter">
                    {doc.case_files?.matter_type ?? "—"} · {doc.case_files?.matter_subtype ?? "Not classified"}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* Active Client Files — clickable */}
        <section className="atty-section">
          <h2 className="atty-section-title">Active Client Files</h2>
          {!caseFiles?.length ? (
            <div className="atty-empty">No open case files</div>
          ) : (
            <div className="atty-file-list">
              {(caseFiles as (CaseFile & { profiles: Profile })[]).map((cf) => (
                <Link
                  key={cf.id}
                  href={`/attorney/client/${cf.user_id}`}
                  className="atty-file-card atty-file-card-link"
                >
                  <div className="atty-file-client">{cf.profiles?.full_name ?? cf.profiles?.email ?? "Unknown"}</div>
                  <div className="atty-file-matter">
                    {cf.matter_type ?? "Unclassified"} {cf.matter_subtype ? `— ${cf.matter_subtype}` : ""}
                  </div>
                  {cf.summary && <p className="atty-file-summary">{cf.summary}</p>}
                  {cf.next_action && (
                    <div className="atty-file-action">
                      <span>Next: </span>{cf.next_action}
                    </div>
                  )}
                  <div className="atty-file-footer">
                    <span>Updated {new Date(cf.updated_at).toLocaleDateString()}</span>
                    <span>{cf.goals?.length ?? 0} goal{cf.goals?.length !== 1 ? "s" : ""}</span>
                    <span className="atty-file-view-link">View File →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* All Documents */}
        {others.length > 0 && (
          <section className="atty-section">
            <h2 className="atty-section-title">All Documents</h2>
            <div className="atty-doc-list">
              {others.map((doc) => (
                <Link key={doc.id} href={`/attorney/review/${doc.id}`} className="atty-doc-card">
                  <div className="atty-doc-header">
                    <span className="atty-doc-type">{WIZARD_LABELS[doc.doc_type] ?? doc.doc_type}</span>
                    <span className={`atty-badge ${STATUS_COLORS[doc.status]}`}>{STATUS_LABELS[doc.status]}</span>
                  </div>
                  <div className="atty-doc-title">{doc.title}</div>
                  <div className="atty-doc-meta">
                    <span>{doc.profiles?.full_name ?? doc.profiles?.email ?? "Unknown client"}</span>
                    <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
