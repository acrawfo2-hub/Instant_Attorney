import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CaseFile, FactItem, BYPASS_USER_ID, WIZARD_LABELS } from "@/lib/types";
import type { Document, WizardType } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function getData() {
  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) redirect("/login");
    userId = user.id;
  }

  const [{ data: caseFile }, { data: facts }, { data: documents }] = await Promise.all([
    db.from("case_files")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("fact_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    db.from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  // Find pre-warmed docs indexed by wizard type for instant-launch
  const allDocs = (documents ?? []) as Document[];
  const preWarmedByType: Record<string, string> = {};
  for (const doc of allDocs) {
    if (doc.status === "pre_warmed" && !preWarmedByType[doc.doc_type]) {
      preWarmedByType[doc.doc_type] = doc.id;
    }
  }

  return {
    caseFile: caseFile as CaseFile | null,
    facts: (facts ?? []) as FactItem[],
    documents: allDocs.filter((d) => d.status !== "pre_warmed"),
    preWarmedByType,
    userId,
  };
}

function MatterBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const label = type === "reactive" ? "Reactive Matter" : "Preventive Matter";
  return <span className="lf-badge">{label}</span>;
}

const DOC_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_review: "Under Review (48h)",
  approved: "Approved",
  changes_requested: "Revisions Requested",
  delivered: "Delivered",
};

const DOC_STATUS_CLASSES: Record<string, string> = {
  draft: "lf-doc-status-draft",
  pending_review: "lf-doc-status-review",
  approved: "lf-doc-status-approved",
  changes_requested: "lf-doc-status-changes",
  delivered: "lf-doc-status-delivered",
};

export default async function DashboardPage() {
  const hdrs = await headers();
  const isBypass = hdrs.get("x-bypass-auth") === "true" || BYPASS_AUTH;

  const { caseFile, facts, documents, preWarmedByType } = await getData();

  const confirmed = facts.filter((f) => f.status === "confirmed");
  const gaps = facts.filter((f) => f.status === "gap");
  const isEmpty = !caseFile;
  const strategy = caseFile?.legal_strategy ?? null;
  const recommendedWizards = strategy?.recommended_wizards ?? [];

  return (
    <div className="lf-shell">
      {/* Header */}
      <header className="lf-header">
        <Link href="/" className="lf-header-logo">
          <div className="fc-logo-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          Instant-Attorney
        </Link>

        <div className="lf-header-center">
          <span className="lf-header-title">Your File</span>
          {caseFile && <MatterBadge type={caseFile.matter_type} />}
        </div>

        <div className="lf-header-right">
          {isBypass && <span className="ob-bypass-badge">Test Mode</span>}
          <Link href="/chat" className="lf-begin-btn">
            {isEmpty ? "Begin Intake" : "Continue Intake"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="lf-main">
        {isEmpty ? (
          <div className="lf-empty">
            <div className="lf-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h2 className="lf-empty-title">Your file is ready.</h2>
            <p className="lf-empty-sub">
              Begin your ACP-protected intake interview. As we talk, your goals, facts, and strategy will appear here in your Living File.
            </p>
            <Link href="/chat" className="lf-begin-btn lf-begin-btn-lg">
              Begin Intake &rarr;
            </Link>
          </div>
        ) : (
          <div className="lf-grid">

            {/* Matter + Next Action */}
            <div className="lf-card lf-card-sm">
              <div className="lf-card-label">Matter</div>
              <div className="lf-card-value">
                {caseFile.matter_subtype
                  ? caseFile.matter_subtype.replace(/_/g, " ")
                  : "Intake in progress"}
              </div>
              <div className="lf-card-meta">
                Opened {new Date(caseFile.opened_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>

            <div className="lf-card lf-card-sm lf-card-action">
              <div className="lf-card-label">Next Action</div>
              <div className="lf-card-value lf-next-action">
                {caseFile.next_action ?? "Continue intake to determine"}
              </div>
            </div>

            {/* Case Summary */}
            {caseFile.summary && (
              <div className="lf-card lf-card-full">
                <div className="lf-card-label">Case Summary</div>
                <p className="lf-summary">{caseFile.summary}</p>
              </div>
            )}

            {/* Goals */}
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Your Goals</div>
              {caseFile.goals && caseFile.goals.length > 0 ? (
                <ul className="lf-list">
                  {(caseFile.goals as string[]).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              ) : (
                <p className="lf-empty-field">Goals will appear as identified in your intake chat.</p>
              )}
            </div>

            {/* Legal Strategy */}
            {strategy && (
              <div className="lf-card lf-card-full lf-card-strategy">
                <div className="lf-card-label">Legal Strategy</div>
                {strategy.summary && <p className="lf-strategy-summary">{strategy.summary}</p>}

                <div className="lf-strategy-grid">
                  {strategy.strengths?.length > 0 && (
                    <div>
                      <div className="lf-strategy-sub">Strengths</div>
                      <ul className="lf-list lf-list-confirmed">
                        {strategy.strengths.map((s, i) => <li key={i}>{s}</li>)}
                      </ul>
                    </div>
                  )}
                  {strategy.risks?.length > 0 && (
                    <div>
                      <div className="lf-strategy-sub">Risks</div>
                      <ul className="lf-list lf-list-gap">
                        {strategy.risks.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>

                {strategy.instruments?.length > 0 && (
                  <div className="lf-instruments">
                    <div className="lf-strategy-sub">Suggested Instruments</div>
                    <ul className="lf-list">
                      {strategy.instruments.map((inst, i) => <li key={i}>{inst}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Confirmed Facts + Gaps */}
            <div className="lf-card lf-card-half">
              <div className="lf-card-label">
                Confirmed Facts
                {confirmed.length > 0 && <span className="lf-count">{confirmed.length}</span>}
              </div>
              {confirmed.length > 0 ? (
                <ul className="lf-list lf-list-confirmed">
                  {confirmed.map((f) => <li key={f.id}>{f.description}</li>)}
                </ul>
              ) : (
                <p className="lf-empty-field">Facts confirmed during intake will appear here.</p>
              )}
            </div>

            <div className="lf-card lf-card-half">
              <div className="lf-card-label">
                Open Fact Gaps
                {gaps.length > 0 && <span className="lf-count lf-count-gap">{gaps.length}</span>}
              </div>
              {gaps.length > 0 ? (
                <ul className="lf-list lf-list-gap">
                  {gaps.map((f) => <li key={f.id}>{f.description}</li>)}
                </ul>
              ) : (
                <p className="lf-empty-field">Missing facts to track will appear here.</p>
              )}
            </div>

            {/* Document Wizards */}
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Document Wizards</div>
              {recommendedWizards.length > 0 ? (
                <>
                  <p className="lf-wizard-hint">Your attorney has suggested the following documents based on your matter. Launch a wizard to begin drafting.</p>
                  <div className="lf-wizard-grid">
                    {recommendedWizards.map((wType) => (
                      <WizardCard
                        key={wType}
                        wizardType={wType}
                        caseFileId={caseFile.id}
                        preWarmedDocId={preWarmedByType[wType]}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="lf-empty-field">
                  Document wizards will appear here once your intake establishes a legal strategy. Continue your intake chat to unlock them.
                </p>
              )}
            </div>

            {/* Documents */}
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Your Documents</div>
              {documents.length > 0 ? (
                <div className="lf-doc-list">
                  {documents.map((doc) => (
                    <div key={doc.id} className="lf-doc-item">
                      <div className="lf-doc-info">
                        <span className="lf-doc-title">{doc.title}</span>
                        <span className="lf-doc-type">{WIZARD_LABELS[doc.doc_type as WizardType] ?? doc.doc_type}</span>
                      </div>
                      <div className="lf-doc-right">
                        <span className={`lf-doc-status ${DOC_STATUS_CLASSES[doc.status] ?? ""}`}>
                          {DOC_STATUS_LABELS[doc.status] ?? doc.status}
                        </span>
                        <span className="lf-doc-date">{new Date(doc.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="lf-empty-field">
                  Documents generated through wizards will appear here once attorney-reviewed.
                </p>
              )}
            </div>

            {/* Attorney Assessment */}
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Attorney Assessment</div>
              {caseFile.attorney_assessment ? (
                <p className="lf-assessment">{caseFile.attorney_assessment}</p>
              ) : (
                <p className="lf-empty-field">Crawford Law will add an assessment once your intake is complete.</p>
              )}
            </div>

          </div>
        )}
      </main>
    </div>
  );
}

function WizardCard({
  wizardType,
  caseFileId,
  preWarmedDocId,
}: {
  wizardType: WizardType;
  caseFileId: string;
  preWarmedDocId?: string;
}) {
  const label = WIZARD_LABELS[wizardType] ?? wizardType;
  const href = preWarmedDocId
    ? `/wizard/${wizardType}?caseFileId=${caseFileId}&docId=${preWarmedDocId}`
    : `/wizard/${wizardType}?caseFileId=${caseFileId}`;

  const icons: Record<WizardType, string> = {
    intake_summary: "📋",
    demand_letter: "✉️",
    complaint_letter: "📣",
    draft_contract: "📝",
    draft_waiver: "🤝",
    wills_trusts: "⚖️",
    doc_review: "🔍",
  };

  return (
    <Link href={href} className={`lf-wizard-card ${preWarmedDocId ? "lf-wizard-card-ready" : ""}`}>
      <span className="lf-wizard-icon">{icons[wizardType] ?? "📄"}</span>
      <div className="lf-wizard-card-body">
        <span className="lf-wizard-label">{label}</span>
        {preWarmedDocId && (
          <span className="lf-wizard-ready-badge">Draft ready</span>
        )}
      </div>
      <span className="lf-wizard-arrow">→</span>
    </Link>
  );
}
