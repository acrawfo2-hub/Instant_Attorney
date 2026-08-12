import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { docTypeLabel, personDisplayName } from "@/lib/types";
import { buildDocumentPlan } from "@/lib/next-step";
import type { CaseFile, Document, Attachment, Profile, IntakeMessage } from "@/lib/types";
import DocumentPlanEditor from "./DocumentPlanEditor";
import AccountMenu from "@/components/AccountMenu";
import AttorneyFreestyleChat from "@/components/AttorneyFreestyleChat";
import AttorneyContextHeader from "@/components/AttorneyContextHeader";

interface CaseFileWithDocs extends CaseFile {
  documents: Document[];
  attachments: Attachment[];
  messages: IntakeMessage[];
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

  const [{ data: rawDocs }, { data: rawAtts }, { data: rawMsgs }] =
    await Promise.all([
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
            .neq("status", "failed")
            .order("created_at", { ascending: false })
        : { data: [] },
      caseFileIds.length
        ? db
            .from("intake_messages")
            .select("*")
            .in("case_file_id", caseFileIds)
            .order("created_at", { ascending: true })
        : { data: [] },
    ]);

  const docs = (rawDocs ?? []) as Document[];
  const atts = (rawAtts ?? []) as Attachment[];
  const msgs = (rawMsgs ?? []) as IntakeMessage[];

  const caseFilesWithData: CaseFileWithDocs[] = caseFiles.map((cf) => ({
    ...cf,
    documents: docs.filter((d) => d.case_file_id === cf.id && !d.parent_document_id),
    attachments: atts.filter((a) => a.case_file_id === cf.id),
    messages: msgs.filter((m) => m.case_file_id === cf.id),
  }));

  const client = clientProfile as Profile;

  return (
    <div className="atty-shell">
      <AttorneyContextHeader currentArea="client" client={{ id: userId, name: personDisplayName(client) }} />
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
          <div className="atty-header-right">
            <Link href="/attorney" className="atty-back-link">
              ← Dashboard
            </Link>
            <AccountMenu />
          </div>
        </div>
      </header>

      <main className="atty-main">
        {/* Client identity */}
        <div className="atty-client-card">
          <div className="atty-client-avatar">
            {personDisplayName(client).charAt(0).toUpperCase()}
          </div>
          <div className="atty-client-info">
            <div className="atty-client-name">
              {personDisplayName(client)}
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

              {/* Document plan — AI ranking + attorney lead override */}
              {(() => {
                const plan = buildDocumentPlan(cf, cf.documents);
                if (plan.length === 0) return null;
                const usesPlan = !!cf.legal_strategy?.document_plan?.length;
                const overridden = usesPlan
                  ? !!cf.legal_strategy?.lead_key_override
                  : !!cf.legal_strategy?.lead_override;
                return (
                  <DocumentPlanEditor
                    caseFileId={cf.id}
                    items={plan}
                    usesPlan={usesPlan}
                    overridden={overridden}
                    rationale={cf.legal_strategy?.lead_rationale}
                  />
                );
              })()}

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
                            {docTypeLabel(doc.doc_type)}
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

              {cf.messages.length > 0 && (
                <div className="atty-case-subsection">
                  <h3 className="atty-case-subtitle">
                    Intake Conversation ({cf.messages.length})
                  </h3>
                  <div className="atty-chat-list">
                    {cf.messages.map((m) => (
                      <div
                        key={m.id}
                        className={`atty-chat-msg ${m.role === "user" ? "atty-chat-user" : "atty-chat-assistant"}`}
                      >
                        <span className="atty-chat-role">
                          {m.role === "user" ? "Client" : "Assistant"}
                          <span className="atty-chat-time">
                            {new Date(m.created_at).toLocaleString()}
                          </span>
                        </span>
                        {m.content}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Attorney freestyle work-product chat for this case file */}
              <AttorneyFreestyleChat caseFileId={cf.id} />

              {/* Organized digest from the last freestyle session (work-product) */}
              {cf.attorney_workspace_summary && (
                <div className="fs-digest">
                  <div className="fs-digest-head">
                    <span className="fs-digest-title">
                      From your freestyle workspace
                    </span>
                    {cf.attorney_workspace_summarized_at && (
                      <span className="fs-digest-time">
                        {new Date(cf.attorney_workspace_summarized_at).toLocaleString()}
                      </span>
                    )}
                  </div>
                  <div className="fs-digest-body">
                    {cf.attorney_workspace_summary}
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
                          {att.case_relevance && (
                            <div className="atty-att-relevance">
                              {att.case_relevance}
                            </div>
                          )}
                          {att.key_sections?.length > 0 && (
                            <ul className="atty-att-sections">
                              {att.key_sections.map((s, i) => (
                                <li key={i}>{s}</li>
                              ))}
                            </ul>
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
                            className={`atty-badge ${att.status === "ready" ? "atty-badge-green" : "atty-badge-gray"}`}
                          >
                            {att.status === "processing" ? "analyzing" : att.status}
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
