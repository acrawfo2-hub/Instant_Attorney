import React from "react";
import Link from "next/link";
import AttachmentPanel from "@/components/AttachmentPanel";
import NextStepGuide from "@/components/NextStepGuide";
import ReviewSlaClock from "@/components/ReviewSlaClock";
import type { CaseFile, FactItem, Document, Profile, WizardType, ConsultRequest } from "@/lib/types";
import { docTypeLabel } from "@/lib/types";
import { buildDocumentPlan } from "@/lib/next-step";
import type { PlanItem } from "@/lib/next-step";

// Build the wizard link for a planned document, carrying its stable plan key
// (+ instrument title + engine) so distinct documents never collide. Pre-warm
// only applies to legacy engine-keyed items (key === wizard).
function planWizardHref(
  caseFileId: string,
  item: PlanItem,
  preWarmedByType: Record<string, string>,
): string {
  const params = new URLSearchParams({ caseFileId });
  const preWarm = item.key === item.wizard ? preWarmedByType[item.wizard] : undefined;
  const docId = item.docId ?? preWarm;
  if (docId) params.set("docId", docId);
  if (item.instrument) params.set("instrument", item.instrument);
  params.set("planKey", item.key);
  return `/wizard/${item.wizard}?${params.toString()}`;
}

// ── Document status display ──────────────────────────────────────────────────

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

function DocStatusLine({ doc }: { doc: Document }) {
  const label = DOC_STATUS_LABELS[doc.status] ?? doc.status;
  const cls = DOC_STATUS_CLASSES[doc.status] ?? "";

  if (doc.status === "draft") {
    return (
      <div className="lf-doc-status-group">
        <span className={`lf-doc-status ${cls}`}>{label}</span>
        <span className="lf-doc-not-submitted">Not submitted</span>
      </div>
    );
  }

  if (doc.status === "pending_review" && doc.submitted_at) {
    return (
      <div className="lf-doc-status-group">
        <span className={`lf-doc-status ${cls}`}>{label}</span>
        <ReviewSlaClock submittedAt={doc.submitted_at} compact />
      </div>
    );
  }

  if (doc.submitted_at) {
    const submittedDate = new Date(doc.submitted_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return (
      <div className="lf-doc-status-group">
        <span className={`lf-doc-status ${cls}`}>{label}</span>
        <span className="lf-doc-submitted-date">Submitted {submittedDate}</span>
      </div>
    );
  }

  return <span className={`lf-doc-status ${cls}`}>{label}</span>;
}

// ── Instrument → wizard type heuristic ──────────────────────────────────────
// Maps instrument description text to the best matching wizard type.
// Returns "general_document" for anything that doesn't fit a specific type.

function guessWizardType(instrument: string): WizardType {
  const lower = instrument.toLowerCase();

  // Releases / waivers
  if (lower.includes("waiver") || lower.includes("release") || lower.includes("indemnification"))
    return "draft_waiver";

  // Demand-style letters (cease & desist, strongly worded, notices of breach, etc.)
  if (
    lower.includes("cease and desist") ||
    lower.includes("cease & desist") ||
    lower.includes("demand letter") ||
    lower.includes("strongly worded") ||
    lower.includes("notice of breach") ||
    lower.includes("notice of default") ||
    lower.includes("demand")
  ) return "demand_letter";

  // Regulatory / agency complaints
  if (
    lower.includes("eeoc") ||
    lower.includes("nlrb") ||
    lower.includes("osha") ||
    lower.includes("twc") ||
    lower.includes("regulatory complaint") ||
    lower.includes("agency complaint") ||
    lower.includes("complaint letter") ||
    lower.includes("complaint to")
  ) return "complaint_letter";

  // Estate planning
  if (
    lower.includes("will ") || lower.includes("wills") ||
    lower.includes("trust") ||
    lower.includes("estate plan") ||
    lower.includes("power of attorney") ||
    lower.includes("healthcare directive") ||
    lower.includes("living will")
  ) return "wills_trusts";

  // Document review (third-party drafted, review only)
  if (
    lower.includes("review only") ||
    (lower.includes("review") && (lower.includes("agreement") || lower.includes("contract") || lower.includes("document")))
  ) return "doc_review";

  // Contracts / agreements / policies
  if (
    lower.includes("contract") ||
    lower.includes("agreement") ||
    lower.includes("subcontract") ||
    lower.includes("mou") ||
    lower.includes("memorandum of understanding") ||
    lower.includes("policy") ||
    lower.includes("manual") ||
    lower.includes("procedures")
  ) return "draft_contract";

  // Everything else → generic high-quality legal document
  return "general_document";
}

// ── Matter badge ─────────────────────────────────────────────────────────────

function MatterBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const label = type === "reactive" ? "Reactive Matter" : "Preventive Matter";
  return <span className="lf-badge">{label}</span>;
}

// ── Main component ───────────────────────────────────────────────────────────

interface ClientFileViewProps {
  caseFile: CaseFile;
  facts: FactItem[];
  documents: Document[];
  childDocuments?: Document[];
  preWarmedByType: Record<string, string>;
  mode: "client" | "attorney";
  clientProfile?: Profile;
  consultRequest?: ConsultRequest | null;
  hasConsultSub?: boolean;
}

export default function ClientFileView({
  caseFile,
  facts,
  documents,
  childDocuments = [],
  preWarmedByType,
  mode,
  clientProfile,
  consultRequest,
  hasConsultSub = false,
}: ClientFileViewProps) {
  const childrenByParent = childDocuments.reduce<Record<string, Document[]>>((acc, child) => {
    if (!child.parent_document_id) return acc;
    (acc[child.parent_document_id] ??= []).push(child);
    return acc;
  }, {});
  const confirmed = facts.filter((f) => f.status === "confirmed");
  const gaps = facts.filter((f) => f.status === "gap");
  const strategy = caseFile.legal_strategy ?? null;
  const isAttorney = mode === "attorney";
  // The file's ranked document plan (priority order, lead first). This is the
  // legal-instruments list and the path into the document wizard.
  const plan = buildDocumentPlan(caseFile, documents);

  return (
    <div className="lf-grid">
      {/* Plain-language guidance layer — always shows the one obvious next step.
          Client mode only; sits on top of the detailed Living File below. */}
      {!isAttorney && (
        <NextStepGuide
          caseFile={caseFile}
          documents={documents}
          facts={facts}
          preWarmedByType={preWarmedByType}
        />
      )}

      {/* Attorney banner */}
      {isAttorney && clientProfile && (
        <div className="lf-card lf-card-full lf-atty-banner">
          <div className="lf-atty-banner-inner">
            <div>
              <div className="lf-atty-banner-client">
                {clientProfile.full_name ?? clientProfile.email}
              </div>
              {clientProfile.email && clientProfile.full_name && (
                <div className="lf-atty-banner-email">{clientProfile.email}</div>
              )}
              {clientProfile.phone && (
                <div className="lf-atty-banner-email">{clientProfile.phone}</div>
              )}
            </div>
            <div className="lf-atty-banner-actions">
              <button className="lf-atty-review-btn" disabled title="Coming soon">
                Review File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Consult status / CTA — client mode only */}
      {!isAttorney && (() => {
        const cr = consultRequest;
        if (cr?.status === "confirmed" && cr.confirmed_time) {
          const timeStr = new Date(cr.confirmed_time).toLocaleString("en-US", {
            timeZone: "America/Chicago", weekday: "long", month: "long", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZoneName: "short",
          });
          return (
            <div className="lf-card lf-card-full lf-consult-banner lf-consult-banner-confirmed">
              <div className="lf-consult-banner-inner">
                <div className="lf-consult-banner-text">
                  <span className="lf-consult-rec-badge lf-consult-rec-badge-confirmed">Consult Confirmed</span>
                  <span className="lf-consult-desc"><strong>{timeStr}</strong> · Andrew will call {cr.client_phone ?? "you"}</span>
                </div>
              </div>
            </div>
          );
        }
        if (cr?.status === "attorney_proposed" && cr.attorney_proposed_time) {
          const timeStr = new Date(cr.attorney_proposed_time).toLocaleString("en-US", {
            timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric",
            hour: "numeric", minute: "2-digit", timeZoneName: "short",
          });
          return (
            <div className="lf-card lf-card-full lf-consult-banner lf-consult-banner-proposed">
              <div className="lf-consult-banner-inner">
                <div className="lf-consult-banner-text">
                  <span className="lf-consult-rec-badge lf-consult-rec-badge-proposed">New Time Proposed</span>
                  <span className="lf-consult-desc">Andrew suggested: <strong>{timeStr}</strong></span>
                </div>
                <Link href="/dashboard#consult-status" className="lf-consult-btn">Respond →</Link>
              </div>
            </div>
          );
        }
        if (cr?.status === "pending") {
          return (
            <div className="lf-card lf-card-full lf-consult-banner lf-consult-banner-pending">
              <div className="lf-consult-banner-inner">
                <div className="lf-consult-banner-text">
                  <span className="lf-consult-rec-badge lf-consult-rec-badge-pending">Awaiting Confirmation</span>
                  <span className="lf-consult-desc">Your 3 preferred times have been submitted. Andrew will confirm one shortly.</span>
                </div>
              </div>
            </div>
          );
        }
        return (
          <div className={`lf-card lf-card-full lf-consult-banner ${strategy?.recommend_consult ? "lf-consult-banner-recommended" : ""}`}>
            <div className="lf-consult-banner-inner">
              <div className="lf-consult-banner-text">
                {strategy?.recommend_consult ? (
                  <>
                    <span className="lf-consult-rec-badge">Consult Recommended</span>
                    <span className="lf-consult-desc">Your attorney has flagged this matter for a live strategy session.</span>
                  </>
                ) : (
                  <span className="lf-consult-desc">Ready to speak with Andrew Crawford, Esq. directly? Schedule a 1-on-1 strategy session.</span>
                )}
              </div>
              <Link
                href={hasConsultSub ? "/consult/schedule" : "/register?upgrade=consult"}
                className="lf-consult-btn"
              >
                {hasConsultSub ? "Schedule Consult →" : "Schedule Consult · $49.99 →"}
              </Link>
            </div>
          </div>
        );
      })()}

      {/* Matter + Next Action */}
      <div className="lf-card lf-card-sm">
        <div className="lf-card-label">
          Matter
          {!isAttorney && <span className="lf-plain-caption">What your case is about</span>}
        </div>
        <div className="lf-card-value">
          {caseFile.matter_subtype
            ? caseFile.matter_subtype.replace(/_/g, " ")
            : "Intake in progress"}
        </div>
        <div className="lf-card-meta">
          <MatterBadge type={caseFile.matter_type} />
          <span>Opened {new Date(caseFile.opened_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
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
        <div className="lf-card-label">
          {isAttorney ? "Client Goals" : "Your Goals"}
        </div>
        {caseFile.goals && caseFile.goals.length > 0 ? (
          <ul className="lf-list">
            {(caseFile.goals as string[]).map((g, i) => (
              <li key={i}>{g}</li>
            ))}
          </ul>
        ) : (
          <p className="lf-empty-field">Goals will appear as identified in the intake chat.</p>
        )}
      </div>

      {/* Legal Strategy */}
      {strategy && (
        <div className="lf-card lf-card-full lf-card-strategy">
          <div className="lf-card-label">
            Legal Strategy
            {!isAttorney && <span className="lf-plain-caption">Your game plan, in plain terms</span>}
          </div>
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

          {/* Legacy free-form instruments: attorney reference, or client fallback
              when there's no ranked plan yet. The ranked plan list below is the
              primary instruments → wizard path. */}
          {strategy.instruments?.length > 0 && (isAttorney || plan.length === 0) && (
            <div className="lf-instruments">
              <div className="lf-strategy-sub">
                Suggested Instruments
                {!isAttorney && <span className="lf-plain-caption lf-plain-caption-sub">Documents we can create for you</span>}
              </div>
              <ul className="lf-list">
                {strategy.instruments.map((inst, i) => {
                  if (isAttorney) return <li key={i}>{inst}</li>;

                  const wizardType = guessWizardType(inst);
                  const doc = documents.find((d) => d.doc_type === wizardType);
                  const preWarmedId = preWarmedByType[wizardType];

                  // Build the wizard URL — pass instrument name for general_document so the AI knows what to draft
                  const instrumentParam = wizardType === "general_document"
                    ? `&instrument=${encodeURIComponent(inst)}`
                    : "";

                  let action: React.ReactNode;
                  if (doc?.status === "pending_review") {
                    action = <span className="lf-inst-pending">Awaiting 48hr Review</span>;
                  } else if (doc?.status === "approved" || doc?.status === "delivered") {
                    action = <span className="lf-inst-done">✓ Completed</span>;
                  } else if (doc?.status === "draft" || doc?.status === "changes_requested") {
                    const href = `/wizard/${wizardType}?caseFileId=${caseFile.id}&docId=${doc.id}${instrumentParam}`;
                    action = (
                      <Link href={href} className="lf-inst-start-btn">
                        {doc.status === "changes_requested" ? "Revisions Needed →" : "Continue Draft →"}
                      </Link>
                    );
                  } else {
                    const href = preWarmedId
                      ? `/wizard/${wizardType}?caseFileId=${caseFile.id}&docId=${preWarmedId}${instrumentParam}`
                      : `/wizard/${wizardType}?caseFileId=${caseFile.id}${instrumentParam}`;
                    action = <Link href={href} className="lf-inst-start-btn">Start Document →</Link>;
                  }

                  return (
                    <li key={i} className="lf-inst-row">
                      <span className="lf-inst-text">{inst}</span>
                      {action}
                    </li>
                  );
                })}
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
          {!isAttorney && <span className="lf-plain-caption">What we know so far</span>}
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
          {!isAttorney && <span className="lf-plain-caption">Details still needed — these are okay to leave for now</span>}
        </div>
        {gaps.length > 0 ? (
          <ul className="lf-list lf-list-gap">
            {gaps.map((f) => <li key={f.id}>{f.description}</li>)}
          </ul>
        ) : (
          <p className="lf-empty-field">Missing facts to track will appear here.</p>
        )}
      </div>

      {/* Legal instruments — client mode only. The ranked document plan IS the
          instruments list: priority order, lead first, each row enters the
          document wizard. */}
      {!isAttorney && (
        <div className="lf-card lf-card-full lf-wizard-spotlight">
          <div className="lf-wizard-spotlight-header">
            <div className="lf-wizard-spotlight-eyebrow">⚡ Your Legal Documents</div>
            <div className="lf-card-label">Your Documents, In Order</div>
          </div>
          {plan.length > 0 ? (
            <>
              <p className="lf-wizard-hint">
                These are the documents your file needs, in priority order. Start with
                your most important one — we&apos;ll compose a complete first draft from
                your Living File in under 2 minutes.
              </p>
              <ol className="lf-plan-doc-list">
                {plan.map((item) => {
                  let action: React.ReactNode;
                  if (item.status === "sent") {
                    action = <span className="lf-inst-pending">Awaiting 48hr Review</span>;
                  } else if (item.status === "approved") {
                    action = <span className="lf-inst-done">✓ Completed</span>;
                  } else {
                    const href = planWizardHref(caseFile.id, item, preWarmedByType);
                    const label =
                      item.status === "changes_requested"
                        ? "Revisions Needed →"
                        : item.status === "in_progress"
                          ? "Continue Draft →"
                          : "Start Document →";
                    action = (
                      <Link href={href} className="lf-inst-start-btn">
                        {label}
                      </Link>
                    );
                  }
                  return (
                    <li
                      key={item.key}
                      className={`lf-plan-doc-row${item.isLead ? " lf-plan-doc-row-lead" : ""}`}
                    >
                      <span className="lf-plan-doc-num">{item.priority}</span>
                      <span className="lf-plan-doc-text">
                        {item.label}
                        {item.isLead && <span className="lf-plan-doc-lead">Start here</span>}
                      </span>
                      {action}
                    </li>
                  );
                })}
              </ol>
            </>
          ) : (
            <>
              <p className="lf-wizard-hint">
                The more you share in your private chat, the better your documents will be — but
                you don&apos;t have to wait. You can start a document right now and we&apos;ll fill
                in the rest as we go. Missing details are never a problem.
              </p>
              <div className="lf-wizard-grid">
                <Link
                  href={`/wizard/general_document?caseFileId=${caseFile.id}`}
                  className="lf-wizard-card"
                >
                  <span className="lf-wizard-icon">📄</span>
                  <div className="lf-wizard-card-body">
                    <span className="lf-wizard-label">Start a document now</span>
                  </div>
                </Link>
                <Link href={`/chat?caseFileId=${caseFile.id}`} className="lf-wizard-card">
                  <span className="lf-wizard-icon">💬</span>
                  <div className="lf-wizard-card-body">
                    <span className="lf-wizard-label">Tell us more first</span>
                  </div>
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {/* Documents */}
      <div className="lf-card lf-card-full" id="documents">
        <div className="lf-card-label">
          {isAttorney ? "Client Documents" : "Your Documents"}
        </div>
        {documents.length > 0 ? (
          <div className="lf-doc-list">
            {documents.map((doc) => {
              const children = childrenByParent[doc.id] ?? [];
              const secondDraft = children.find((c) => c.doc_type === "second_draft");
              const docRow = (
                <div className="lf-doc-inner">
                  <div className="lf-doc-info">
                    <span className="lf-doc-title">{doc.title}</span>
                    <span className="lf-doc-type">{docTypeLabel(doc.doc_type)}</span>
                  </div>
                  <div className="lf-doc-right">
                    <DocStatusLine doc={doc} />
                    <span className="lf-doc-date">{new Date(doc.created_at).toLocaleDateString()}</span>
                    {!isAttorney && doc.status === "approved" && (
                      <div className="lf-doc-downloads">
                        {secondDraft?.draft_text && (
                          <a href={`/api/documents/${secondDraft.id}/download`} className="lf-doc-download-link">
                            Download approved document (.docx)
                          </a>
                        )}
                        {doc.draft_text && (
                          <a href={`/api/documents/${doc.id}/download`} className="lf-doc-download-link lf-doc-download-link-muted">
                            Download original wizard draft (.docx)
                          </a>
                        )}
                      </div>
                    )}
                    {!isAttorney && doc.status === "pending_review" && doc.draft_text && (
                      <a href={`/api/documents/${doc.id}/download`} className="lf-doc-download-link">
                        Download submitted draft (.docx)
                      </a>
                    )}
                  </div>
                </div>
              );

              // Draft docs link to wizard so client can submit; attorney links to review page
              if (isAttorney) {
                return (
                  <Link key={doc.id} href={`/attorney/review/${doc.id}`} className="lf-doc-item lf-doc-item-link">
                    {docRow}
                  </Link>
                );
              }
              if (doc.status === "draft") {
                return (
                  <Link
                    key={doc.id}
                    href={`/wizard/${doc.doc_type}?caseFileId=${doc.case_file_id}&docId=${doc.id}`}
                    className="lf-doc-item lf-doc-item-link lf-doc-item-draft"
                  >
                    {docRow}
                  </Link>
                );
              }
              return (
                <div key={doc.id} className="lf-doc-item">
                  {docRow}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="lf-empty-field">
            {isAttorney
              ? "No documents generated yet for this client."
              : "Documents generated through wizards will appear here once attorney-reviewed."}
          </p>
        )}
      </div>

      {/* Attachments */}
      <div className="lf-card lf-card-full">
        <div className="lf-card-label">Documents &amp; Attachments</div>
        <AttachmentPanel caseFileId={caseFile.id} />
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
  );
}
