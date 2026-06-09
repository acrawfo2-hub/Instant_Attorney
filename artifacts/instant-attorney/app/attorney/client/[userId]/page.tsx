import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { WIZARD_LABELS } from "@/lib/types";
import type { CaseFile, Document, Attachment, Profile } from "@/lib/types";

interface CaseFileWithDocs extends CaseFile {
  documents: Document[];
  attachments: Attachment[];
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Pending Review",
  approved: "Approved",
  changes_requested: "Changes Requested",
  delivered: "Delivered",
  pre_warmed: "Pre-warmed",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "atty-badge-gray",
  pending_review: "atty-badge-amber",
  approved: "atty-badge-green",
  changes_requested: "atty-badge-blue",
  delivered: "atty-badge-gray",
  pre_warmed: "atty-badge-gray",
};

export default async function ClientFilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.is_attorney) redirect("/dashboard");

  const { data: clientProfile } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (!clientProfile) notFound();

  const { data: rawCaseFiles } = await db
    .from("case_files")
    .select("*")
    .eq("user_id", userId)
    .order("opened_at", { ascending: false });

  const caseFiles = (rawCaseFiles ?? []) as CaseFile[];

  const caseFileIds = caseFiles.map((cf) => cf.id);

  const [{ data: rawDocs }, { data: rawAtts }] = await Promise.all([
    caseFileIds.length
      ? db
          .from("documents")
          .select("*")
          .in("case_file_id", caseFileIds)
          .order("created_at", { ascending: false })
      : { data: [] },
    caseFileIds.length
      ? db
          .from("attachments")
          .select("*")
          .in("case_file_id", caseFileIds)
          .order("created_at", { ascending: false })
      : { data: [] },
  ]);

  const docs = (rawDocs ?? []) as Document[];
  const atts = (rawAtts ?? []) as Attachment[];

  const caseFilesWithData: CaseFileWithDocs[] = caseFiles.map((cf) => ({
    ...cf,
    documents: docs.filter((d) => d.case_file_id === cf.id),
    attachments: atts.filter((a) => a.case_file_id === cf.id),
  }));

  const client = clientProfile as Profile;

  return (
    <div className="atty-shell">
      <header className="atty-header">
        <div className="atty-header-inner">
          <div className="atty-brand">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Client File</span>
          </div>
          <Link href="/attorney" className="atty-back-link">
            ← Dashboard
          </Link>
        </div>
      </header>

      <main className="atty-main">
        {/* Client identity */}
        <div className="atty-client-card">
          <div className="atty-client-avatar">
            {(client.full_name ?? client.email).charAt(0).toUpperCase()}
          </div>
          <div className="atty-client-info">
            <div className="atty-client-name">
              {client.full_name ?? client.email}
            </div>
            <div className="atty-client-email">{client.email}</div>
            {client.phone && (
              <div className="atty-client-phone">{client.phone}</div>
            )}
          </div>
          <div className="atty-client-stats">
            <div className="atty-client-stat">
              <span className="atty-client-stat-val">{caseFiles.length}</span>
              <span className="atty-client-stat-lbl">
                Case{caseFiles.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="atty-client-stat">
              <span className="atty-client-stat-val">{docs.length}</span>
              <span className="atty-client-stat-lbl">
                Doc{docs.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="atty-client-stat">
              <span className="atty-client-stat-val">{atts.length}</span>
              <span className="atty-client-stat-lbl">
                Attachment{atts.length !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        </div>

        {/* Case files */}
        {caseFilesWithData.length === 0 ? (
          <div className="atty-empty">No case files for this client</div>
        ) : (
          caseFilesWithData.map((cf) => (
            <section key={cf.id} className="atty-section atty-case-section">
              <div className="atty-case-header">
                <div>
                  <h2 className="atty-case-title">
                    {cf.matter_type
                      ? cf.matter_type.charAt(0).toUpperCase() +
                        cf.matter_type.slice(1)
                      : "Unclassified"}
                    {cf.matter_subtype ? ` — ${cf.matter_subtype}` : ""}
                  </h2>
                  <div className="atty-case-meta">
                    Opened {new Date(cf.opened_at).toLocaleDateString()} ·{" "}
                    <span
                      className={`atty-badge ${cf.status === "open" ? "atty-badge-green" : "atty-badge-gray"}`}
                    >
                      {cf.status}
                    </span>
                    {cf.jurisdiction && ` · ${cf.jurisdiction}`}
                  </div>
                </div>
              </div>

              {cf.summary && (
                <p className="atty-case-summary">{cf.summary}</p>
              )}

              {cf.goals && cf.goals.length > 0 && (
                <div className="atty-case-goals">
                  <span className="atty-case-goals-label">Goals:</span>
                  {cf.goals.map((g, i) => (
                    <span key={i} className="atty-case-goal-tag">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {cf.next_action && (
                <div className="atty-file-action">
                  <strong>Next action:</strong> {cf.next_action}
                </div>
              )}

              {/* Documents for this case file */}
              {cf.documents.length > 0 && (
                <div className="atty-case-subsection">
                  <h3 className="atty-case-subtitle">
                    Documents ({cf.documents.length})
                  </h3>
                  <div className="atty-doc-list">
                    {cf.documents.map((doc) => (
                      <Link
                        key={doc.id}
                        href={`/attorney/review/${doc.id}`}
                        className={`atty-doc-card ${doc.status === "pending_review" ? "atty-doc-card-urgent" : ""}`}
                      >
                        <div className="atty-doc-header">
                          <span className="atty-doc-type">
                            {WIZARD_LABELS[doc.doc_type] ?? doc.doc_type}
                          </span>
                          <span
                            className={`atty-badge ${STATUS_COLORS[doc.status] ?? "atty-badge-gray"}`}
                          >
                            {STATUS_LABELS[doc.status] ?? doc.status}
                          </span>
                        </div>
                        <div className="atty-doc-title">{doc.title}</div>
                        <div className="atty-doc-meta">
                          <span>
                            {new Date(doc.created_at).toLocaleDateString()}
                          </span>
                          {doc.reviewed_at && (
                            <span>
                              Reviewed{" "}
                              {new Date(doc.reviewed_at).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        {doc.attorney_notes && (
                          <div className="atty-doc-notes">
                            {doc.attorney_notes}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Attachments for this case file */}
              {cf.attachments.length > 0 && (
                <div className="atty-case-subsection">
                  <h3 className="atty-case-subtitle">
                    Attachments ({cf.attachments.length})
                  </h3>
                  <div className="atty-att-list">
                    {cf.attachments.map((att) => (
                      <div key={att.id} className="atty-att-row">
                        <div className="atty-att-icon">
                          {att.file_type.startsWith("image/") ? "🖼" : "📄"}
                        </div>
                        <div className="atty-att-body">
                          <div className="atty-att-name">{att.file_name}</div>
                          {att.ai_summary && (
                            <div className="atty-att-summary">
                              {att.ai_summary}
                            </div>
                          )}
                          {att.urgent_findings &&
                            att.urgent_findings !== "None identified" && (
                              <div className="atty-att-urgent">
                                ⚠ {att.urgent_findings}
                              </div>
                            )}
                        </div>
                        <div className="atty-att-side">
                          <span
                            className={`atty-badge ${att.status === "ready" ? "atty-badge-green" : att.status === "failed" ? "atty-badge-amber" : "atty-badge-gray"}`}
                          >
                            {att.status}
                          </span>
                          {att.status === "ready" && (
                            <a
                              href={`/api/attachments/${att.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="atty-att-dl"
                            >
                              Download
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {cf.documents.length === 0 && cf.attachments.length === 0 && (
                <div className="atty-empty" style={{ marginTop: 12 }}>
                  No documents or attachments yet
                </div>
              )}
            </section>
          ))
        )}
      </main>
    </div>
  );
}
