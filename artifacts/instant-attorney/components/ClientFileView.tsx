import React from "react";
import Link from "next/link";
import AttachmentPanel from "@/components/AttachmentPanel";
import DocumentInfoNeeded from "@/components/DocumentInfoNeeded";
import GovFormInstruments from "@/components/GovFormInstruments";
import MissionControlBoard from "@/components/MissionControlBoard";
import ReviewSlaClock from "@/components/ReviewSlaClock";
import RegenerateDocButton from "@/components/RegenerateDocButton";
import CancelDocButton from "@/components/CancelDocButton";
import FactsPanel from "@/components/FactsPanel";
import ExistingCounselCard from "@/components/ExistingCounselCard";
import { placeholderFields } from "@/lib/wizard-parsing";
import { computeMissionControl } from "@/lib/mission-control";
import {
  isFullDepthState,
  isPrepMode,
  jurisdictionFromCaseFileText,
  jurisdictionNotice,
  prepModeBadgeLabel,
  stateBarReferralUrl,
} from "@/lib/jurisdiction";
import { detectMatterFlags, resolveRoadmapForCase } from "@/lib/roadmap-build";
import { computeRoadmapFingerprint } from "@/lib/roadmap-fingerprint";
import type { RoadmapAiOverlay } from "@/lib/roadmap-types";
import RoadmapSpine from "@/components/RoadmapSpine";
import RoadmapToolGroup from "@/components/RoadmapToolGroup";
import PostConsultCard from "@/components/PostConsultCard";
import CaseChatPanel from "@/components/CaseChatPanel";
import type { CaseFile, FactItem, Document, Profile, WizardType, ConsultRequest, ConsultWrapUp, RequestedAttachment, GovFormInstrument, Attachment } from "@/lib/types";
import { isValidWizardType } from "@/lib/document-utils";
import { WIZARD_LABELS, docTypeLabel, personDisplayName, isDocumentOutOfDate, coerceWizardType } from "@/lib/types";

// A document deemed finalized — the attorney's work product is the deliverable,
// so the client's wizard draft underneath it is never flagged out of date or
// offered for regeneration.
const FINALIZED_DOC_STATUSES = new Set(["approved", "delivered"]);

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

// ── Wizard card (client mode only) ──────────────────────────────────────────

const WIZARD_ICONS: Record<WizardType, string> = {
  demand_letter: "✉️",
  complaint_letter: "📣",
  draft_contract: "📝",
  draft_waiver: "🤝",
  wills_trusts: "⚖️",
  doc_review: "🔍",
  general_document: "📄",
  improve_draft: "🪄",
};

function WizardCard({
  wizardType,
  caseFileId,
}: {
  wizardType: WizardType;
  caseFileId: string;
}) {
  const label = WIZARD_LABELS[wizardType] ?? wizardType;
  const href = `/wizard/${wizardType}?caseFileId=${caseFileId}`;

  return (
    <Link href={href} className="lf-wizard-card">
      <span className="lf-wizard-icon">{WIZARD_ICONS[wizardType] ?? "📄"}</span>
      <div className="lf-wizard-card-body">
        <span className="lf-wizard-label">{label}</span>
      </div>
    </Link>
  );
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
  requestedAttachments?: RequestedAttachment[];
  attachments?: Attachment[];
  govForms?: GovFormInstrument[];
  mode: "client" | "attorney";
  clientProfile?: Profile;
  consultRequest?: ConsultRequest | null;
  hasConsultSub?: boolean;
  completedConsultWrapUp?: ConsultWrapUp | null;
  completedConsultSubmittedAt?: string | null;
  roadmapOverlay?: RoadmapAiOverlay;
}

export default function ClientFileView({
  caseFile,
  facts,
  documents,
  childDocuments = [],
  requestedAttachments = [],
  attachments = [],
  govForms = [],
  mode,
  clientProfile,
  consultRequest,
  hasConsultSub = false,
  completedConsultWrapUp = null,
  completedConsultSubmittedAt = null,
  roadmapOverlay = {},
}: ClientFileViewProps) {
  const childrenByParent = childDocuments.reduce<Record<string, Document[]>>((acc, child) => {
    if (!child.parent_document_id) return acc;
    (acc[child.parent_document_id] ??= []).push(child);
    return acc;
  }, {});
  // A fact is "hypothetical" if explicitly tagged (kind) OR it carries the
  // What-If Game's "What-if · " description prefix (keeps working pre-migration).
  const isHypothetical = (f: FactItem) =>
    f.kind === "hypothetical" || /^What-if · /i.test(f.description);
  const confirmed = facts.filter((f) => f.status === "confirmed" && !isHypothetical(f));
  const gaps = facts.filter((f) => f.status === "gap" && !isHypothetical(f));
  const hypotheticals = facts.filter(isHypothetical);

  // Many "gaps" are really unfilled [[placeholders]] copied out of a drafted
  // document (e.g. "Date Of Memorandum", "Reviewing Attorney Name"). They are
  // noise in Open Fact Gaps because they carry no link to the document that needs
  // them. Re-derive each document's current placeholder labels and pull any gap
  // that matches one out into its own document-attributed section. Done in the
  // view (no schema change) so it self-corrects as drafts get filled.
  const docPlaceholders = [...documents, ...childDocuments]
    .filter((d) => d.draft_text)
    .map((d) => {
      const labels = placeholderFields(d.draft_text as string).map((f) => f.label);
      return { id: d.id, title: d.title || docTypeLabel(d.doc_type), lowerSet: new Set(labels.map((l) => l.toLowerCase())) };
    });
  const placeholderLabelSet = new Set<string>();
  for (const dp of docPlaceholders) for (const l of dp.lowerSet) placeholderLabelSet.add(l);

  const realGaps = gaps.filter((g) => !placeholderLabelSet.has(g.description.toLowerCase()));
  const placeholderGaps = gaps.filter((g) => placeholderLabelSet.has(g.description.toLowerCase()));

  // Group placeholder gaps under each document whose draft still contains them.
  // A blank shared by multiple documents is listed under each so its origin is
  // never ambiguous. Descriptions are deduped within a group.
  const placeholderGroups = docPlaceholders
    .map((dp) => ({
      docId: dp.id,
      docTitle: dp.title,
      items: Array.from(
        new Set(
          placeholderGaps
            .filter((g) => dp.lowerSet.has(g.description.toLowerCase()))
            .map((g) => g.description),
        ),
      ),
    }))
    .filter((grp) => grp.items.length > 0);
  const strategy = caseFile.legal_strategy ?? null;
  const recommendedWizards = strategy?.recommended_wizards ?? [];
  const isAttorney = mode === "attorney";
  // Surface the child-support estimator only on family matters, detected by
  // reusing the family-instrument keyword matcher over the matter's own text.
  const matterText = `${caseFile.matter_subtype ?? ""} ${caseFile.summary ?? ""}`;
  const { isFamilyMatter, isDebtMatter, isDefamationMatter, isEmploymentMatter, isPiMatter } =
    detectMatterFlags(matterText);

  const resolvedRoadmap = !isAttorney
    ? resolveRoadmapForCase({
        caseFile,
        facts,
        documents,
        requestedAttachments,
        consultRequest: consultRequest ?? null,
      })
    : null;

  const roadmapFingerprint =
    resolvedRoadmap
      ? computeRoadmapFingerprint({
          caseFile,
          facts,
          documents,
          requestedAttachments,
          consultRequest: consultRequest ?? null,
          attachmentCount: attachments.length,
        })
      : "";

  const hasActiveConsult =
    Boolean(consultRequest) &&
    consultRequest?.status !== "cancelled" &&
    consultRequest?.status !== "completed";

  // The client has "brought in a document" once at least one upload exists that
  // didn't fail to store. Document Review only makes sense against a real
  // uploaded document, so it stays locked until then.
  const hasUploadedDoc = attachments.some((a) => a.status !== "failed");

  // Until a document is uploaded, strip Document Review from the recommended
  // wizards so it never becomes the Mission Control hero or a queued action.
  const gatedCaseFile: CaseFile =
    hasUploadedDoc || !caseFile.legal_strategy
      ? caseFile
      : {
          ...caseFile,
          legal_strategy: {
            ...caseFile.legal_strategy,
            recommended_wizards: (caseFile.legal_strategy.recommended_wizards ?? []).filter(
              (w) => coerceWizardType(w) !== "doc_review",
            ),
          },
        };

  const missionBoard = computeMissionControl({
    caseFile: gatedCaseFile,
    documents,
    facts,
    requestedAttachments,
    govForms,
    mode,
    consultClientActions: completedConsultWrapUp?.clientActions ?? [],
  });

  return (
    <div className="lf-grid">
      {/* Local Counsel Prep badge — non-Texas matters */}
      {!isAttorney && (() => {
        const raw = caseFile.jurisdiction?.trim() || null;
        if (!raw || /unconfirmed/i.test(raw)) return null;
        const code = jurisdictionFromCaseFileText(raw);
        // Texas → full depth (no prep banner). Anything else confirmed → Prep.
        if (isFullDepthState(code) || /^texas$|^tx$/i.test(raw)) return null;
        const showPrep = code ? isPrepMode(code) : true;
        if (!showPrep) return null;
        return (
          <div className="lf-card lf-card-full lf-prep-banner" role="status">
            <div className="lf-prep-banner-inner">
              <div className="lf-prep-banner-text">
                <span className="lf-prep-badge">{prepModeBadgeLabel(code ?? raw)}</span>
                <span className="lf-prep-desc">
                  {jurisdictionNotice(code ?? raw) ??
                    "You are in Local Counsel Prep mode — we help organize your file for a lawyer licensed in your state."}
                </span>
              </div>
              <a
                href={stateBarReferralUrl(code ?? raw)}
                target="_blank"
                rel="noopener noreferrer"
                className="lf-consult-btn"
              >
                Find local counsel →
              </a>
            </div>
          </div>
        );
      })()}

      {/* Consult status / CTA — client mode only; pinned to the very top */}
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

      {/* Post-consult action plan — client mode */}
      {!isAttorney && completedConsultWrapUp && (
        <PostConsultCard
          wrapUp={completedConsultWrapUp}
          submittedAt={completedConsultSubmittedAt}
        />
      )}

      {/* Mission Control — ranked actions + hero next step; strategy & instruments remain below */}
      <MissionControlBoard
        board={missionBoard}
        caseFileId={caseFile.id}
        mode={mode}
      />

      {resolvedRoadmap && (
        <RoadmapSpine
          resolved={resolvedRoadmap}
          initialOverlay={roadmapOverlay}
          fingerprint={roadmapFingerprint}
          caseFileId={caseFile.id}
          hasConsult={hasActiveConsult || hasConsultSub}
          consultHref={hasConsultSub ? "/consult/schedule" : "/register?upgrade=consult"}
        />
      )}

      {/* Attorney banner */}
      {isAttorney && clientProfile && (
        <div className="lf-card lf-card-full lf-atty-banner">
          <div className="lf-atty-banner-inner">
            <div>
              <div className="lf-atty-banner-client">
                {personDisplayName(clientProfile)}
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

      {/* Existing counsel context */}
      <ExistingCounselCard
        caseFileId={caseFile.id}
        counselIntakeAt={caseFile.counsel_intake_at}
        hasExistingCounsel={caseFile.has_existing_counsel}
        existingCounselName={caseFile.existing_counsel_name}
        counselEngagementGoal={caseFile.counsel_engagement_goal}
        mode={isAttorney ? "attorney" : "client"}
      />

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
        <div className="lf-card lf-card-full lf-card-strategy" id="legal-strategy">
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

          {strategy.instruments?.length > 0 && (
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

                  // Build the wizard URL — pass instrument name for general_document so the AI knows what to draft
                  const instrumentParam = wizardType === "general_document"
                    ? `&instrument=${encodeURIComponent(inst)}`
                    : "";

                  let action: React.ReactNode;
                  if (wizardType === "doc_review" && !hasUploadedDoc) {
                    // Document Review needs a real document to review — point the
                    // client to upload one first instead of starting a draft.
                    action = (
                      <a href="#attachments" className="lf-inst-start-btn lf-inst-locked-btn">
                        Upload a document to review →
                      </a>
                    );
                  } else if (doc?.status === "pending_review") {
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
                    const href = `/wizard/${wizardType}?caseFileId=${caseFile.id}${instrumentParam}`;
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

      {/* Government forms detected in chat — surfaced as instruments to complete */}
      <div id="gov-forms" className="lf-span-full">
        <GovFormInstruments caseFileId={caseFile.id} />
      </div>

      {/* Confirmed Facts + Gaps (side-by-side, capped at 20) + document placeholders */}
      <FactsPanel
        confirmed={confirmed}
        gaps={realGaps}
        placeholderGroups={placeholderGroups}
        isAttorney={isAttorney}
      />

      {/* Contingency preferences captured by the What-If Game (hypothetical, not facts) */}
      {hypotheticals.length > 0 && (
        <div className="lf-card lf-card-full" id="contingency-preferences" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">
            Contingency Preferences
            <span className="lf-count">{hypotheticals.length}</span>
            {!isAttorney && <span className="lf-plain-caption">Your wishes for &ldquo;what if…&rdquo; situations — used to add backup plans to your documents, not treated as facts</span>}
            {isAttorney && <span className="lf-plain-caption">Hypothetical intentions from the What-If Game — not asserted facts</span>}
          </div>
          <ul className="lf-list">
            {hypotheticals.map((f) => (
              <li key={f.id}>{f.description.replace(/^What-if · /i, "")}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Employment tools — employment matters only (client mode). */}
      {!isAttorney && isEmploymentMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="employment-tools"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Employment Tools</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Employment deadlines are short and unforgiving. Check what claim you may have and how much time you
            have left, and — if you were handed a non-compete — see how much of it actually holds up in Texas.
            General information, not legal advice.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link href={`/employment/claim-check?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
              Check my claim &amp; deadline →
            </Link>
            <Link href={`/employment/noncompete?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
              Is my non-compete enforceable? →
            </Link>
          </div>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Debt-collection rights — debt matters only (client mode). */}
      {!isAttorney && isDebtMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="debt-rights"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Know Your Debt-Collection Rights</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Debt problems are common and solvable, and you have real protections — especially in Texas,
            where ordinary debts usually can&apos;t touch your wages. See your rights, the steps you can take,
            and the traps to avoid. If you&apos;ve been sued, there&apos;s a deadline to answer — start there.
          </p>
          <Link href={`/debt/rights?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            See your rights &amp; next steps →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Bankruptcy tools — debt matters only (client mode). */}
      {!isAttorney && isDebtMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="bankruptcy-tools"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Weighing Bankruptcy?</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Bankruptcy is one option among several, and it&apos;s often more manageable than people fear. Check
            whether you could file Chapter 7 (the income screen), and think through all your options — saved to
            this file. General information, not legal advice.
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <Link href={`/bankruptcy/means-test?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
              Run the means test →
            </Link>
            <Link href={`/bankruptcy/exemptions?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
              What would I keep? →
            </Link>
            <Link href={`/bankruptcy/options?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
              Weigh my options →
            </Link>
          </div>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Defamation check — defamation matters only (client mode). */}
      {!isAttorney && isDefamationMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="defamation"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Do You Have a Defamation Case?</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Defamation is common online but tricky in the law. Get an honest read on whether you have a
            claim — and learn the two things people miss: the short one-year deadline, and the anti-SLAPP
            rule that can make you pay the other side&apos;s fees if you sue over public commentary.
          </p>
          <Link href={`/defamation/assess?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            Check my situation →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* What-If Game — pressure-test this matter (client mode only) */}
      {!isAttorney && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="what-if"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Think a Few Steps Ahead</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            A legal strategy is really about understanding every possible outcome before it happens. The
            What-If Game walks you through those &ldquo;what if&hellip;&rdquo; scenarios so we can build a
            strategy that actually works for you. It&apos;s optional, takes a few minutes, and never changes
            your documents — anything you decide to keep is saved here as a contingency preference.
          </p>
          <Link href={`/what-if?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            Play the What-If Game →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Child-support estimator — family matters only (client mode). Saves a
          guideline estimate into this file so a support order/decree seeds from it. */}
      {!isAttorney && isFamilyMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="family-child-support"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Estimate Child Support</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Texas sets child support as a percentage of the paying parent&apos;s monthly net resources.
            Get a free guideline estimate in seconds — we&apos;ll save it to this file so a support order or
            decree can use it. It&apos;s an estimate, not legal advice, and a court may order a different amount.
          </p>
          <Link href={`/family/child-support?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            Estimate child support →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Property-division estimator — family matters only (client mode). Saves a
          guideline community-estate split into this file so a decree seeds from it. */}
      {!isAttorney && isFamilyMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="family-property"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Estimate the Property Split</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Texas divides what you built during the marriage (the community estate) &ldquo;just and
            right,&rdquo; while each spouse keeps their separate property. List your assets and debts for a
            free starting-point picture — we&apos;ll save it to this file so a decree can use it. It&apos;s an
            estimate, not legal advice, and a court may divide things differently.
          </p>
          <Link href={`/family/property-division?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            Estimate the property split →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Possession-schedule generator — family matters only (client mode). */}
      {!isAttorney && isFamilyMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="family-possession"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">See Your Possession Schedule</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Texas presumes the Standard Possession Order for a child 3 or older. See the actual weekend and
            Thursday periods on a calendar, plus the holiday and summer rules — and we&apos;ll save it to this
            file so a parenting plan or decree can use it. It&apos;s the standard schedule; your court order controls.
          </p>
          <Link href={`/family/possession-schedule?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            Show the possession schedule →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Spousal-maintenance screen — family matters only (client mode). */}
      {!isAttorney && isFamilyMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="family-maintenance"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Check Spousal Maintenance</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Texas keeps spousal maintenance narrow. Answer a few questions for an honest read on whether it&apos;s
            on the table, and roughly how much and how long — saved to this file for your documents. General
            information, not legal advice; the court decides.
          </p>
          <Link href={`/family/maintenance?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            Check spousal maintenance →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* PI claim guide — personal injury matters only (client mode). */}
      {!isAttorney && isPiMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="pi-rights"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Injury Claim Playbook</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Insurers move fast — often before you know your rights. See what an expert Texas PI attorney would
            tell you: your rights, the steps to take, and the traps to avoid (especially recorded statements).
          </p>
          <Link href={`/personal-injury/rights?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            See your playbook &amp; next steps →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* PI limitations screener — personal injury matters only (client mode). */}
      {!isAttorney && isPiMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="pi-sol"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">Check Your Filing Deadline</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            Texas generally gives you two years to sue for an injury — but malpractice timing is different.
            Run a free limitations screener from your incident date; we&apos;ll save it to this file.
          </p>
          <Link href={`/personal-injury/sol?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            Check limitations deadline →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Comparative fault impact — personal injury matters only (client mode). */}
      {!isAttorney && isPiMatter && resolvedRoadmap && (
        <RoadmapToolGroup
          sectionId="pi-fault"
          blueprintKey={resolvedRoadmap.blueprintKey}
          currentStageKey={resolvedRoadmap.currentStageKey}
        >
        <div className="lf-card lf-card-full" style={{ borderLeft: "3px solid var(--brand-gold)" }}>
          <div className="lf-card-label">How Fault Affects Recovery</div>
          <p className="lf-wizard-hint" style={{ marginBottom: 14 }}>
            If the insurer says you were partly at fault, see how Texas modified comparative negligence (§ 33.001)
            affects your net recovery — saved to this file.
          </p>
          <Link href={`/personal-injury/fault?caseFileId=${caseFile.id}`} className="lf-inst-start-btn">
            Calculate fault impact →
          </Link>
        </div>
        </RoadmapToolGroup>
      )}

      {/* Document Wizards — client mode only */}
      {!isAttorney && (
        <div className="lf-card lf-card-full lf-wizard-spotlight">
          <div className="lf-wizard-spotlight-header">
            <div className="lf-wizard-spotlight-eyebrow">⚡ Your Next Step</div>
            <div className="lf-card-label">Start Your Documents</div>
          </div>
          {recommendedWizards.length > 0 ? (
            <>
              <p className="lf-wizard-hint">
                Click a document below to start drafting — the AI will compose a complete first draft from your Living File in under 2 minutes.
              </p>
              <div className="lf-wizard-grid">
                {recommendedWizards
                  .filter(isValidWizardType)
                  .filter((wType) => wType !== "doc_review" || hasUploadedDoc)
                  .filter((wType) => wType !== "improve_draft")
                  .map((wType) => (
                  <WizardCard
                    key={wType}
                    wizardType={wType}
                    caseFileId={caseFile.id}
                  />
                ))}
                <WizardCard wizardType="improve_draft" caseFileId={caseFile.id} />
              </div>
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
                <WizardCard wizardType="improve_draft" caseFileId={caseFile.id} />
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
              // A drafted document is "out of date" when the client changed their
              // facts / What-If answers after it was written. Client-only, and
              // never for finalized deliverables.
              const outOfDate =
                !isAttorney &&
                !FINALIZED_DOC_STATUSES.has(doc.status) &&
                isDocumentOutOfDate(doc, facts);
              const docRow = (
                <div className="lf-doc-inner">
                  <div className="lf-doc-info">
                    <span className="lf-doc-title">{doc.title}</span>
                    <span className="lf-doc-type">{docTypeLabel(doc.doc_type)}</span>
                  </div>
                  <div className="lf-doc-right">
                    {outOfDate && (
                      <span className="lf-doc-stale-badge" title="Your file changed after this draft was written.">
                        Out of date
                      </span>
                    )}
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

              // Draft docs link to wizard so client can submit; attorney gets
              // inline downloads plus a link through to the full review screen.
              if (isAttorney) {
                return (
                  <div key={doc.id} className="lf-doc-item">
                    {docRow}
                    <div className="lf-doc-downloads">
                      {doc.draft_text && (
                        <a href={`/api/documents/${doc.id}/download`} className="lf-doc-download-link">
                          Download {secondDraft?.draft_text ? "original draft" : "document"} (.docx)
                        </a>
                      )}
                      {secondDraft?.draft_text && (
                        <a href={`/api/documents/${secondDraft.id}/download`} className="lf-doc-download-link">
                          Download revised draft (.docx)
                        </a>
                      )}
                      <Link href={`/attorney/review/${doc.id}`} className="lf-doc-download-link">
                        Open review →
                      </Link>
                    </div>
                  </div>
                );
              }
              if (doc.status === "draft") {
                const draftLink = (
                  <Link
                    href={`/wizard/${doc.doc_type}?caseFileId=${doc.case_file_id}&docId=${doc.id}`}
                    className="lf-doc-item lf-doc-item-link lf-doc-item-draft"
                  >
                    {docRow}
                  </Link>
                );
                // Keep the regenerate / cancel controls OUTSIDE the wrapping
                // anchor — a button nested in an <a> is invalid and would also
                // trigger the link navigation.
                return (
                  <div key={doc.id} className="lf-doc-stale-group">
                    {draftLink}
                    {outOfDate && <RegenerateDocButton documentId={doc.id} />}
                    <CancelDocButton documentId={doc.id} />
                  </div>
                );
              }
              // Non-draft client docs are viewed inline. If the version the client
              // will use still has [[blanks]], offer an easy fill-in panel that
              // writes the answers straight into the document (and the Living File).
              const fillTarget = secondDraft?.draft_text ? secondDraft : (doc.draft_text ? doc : null);
              return (
                <div key={doc.id} className="lf-doc-item">
                  {docRow}
                  {outOfDate && <RegenerateDocButton documentId={doc.id} subtle />}
                  {fillTarget?.draft_text && (
                    <DocumentInfoNeeded
                      documentId={fillTarget.id}
                      draftText={fillTarget.draft_text}
                      documentTitle={doc.title}
                    />
                  )}
                  {doc.status === "changes_requested" && (
                    <CancelDocButton documentId={doc.id} />
                  )}
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
      <div className="lf-card lf-card-full" id="attachments">
        <div className="lf-card-label">Documents &amp; Attachments</div>
        <AttachmentPanel caseFileId={caseFile.id} />
      </div>

      {/* Direct message channel — client ⇆ attorney. Shown in both views so each
          side sees the same thread. */}
      <div className="lf-card lf-card-full">
        <div className="lf-card-label">
          {isAttorney ? "Messages with Client" : "Messages with Crawford Law"}
        </div>
        <CaseChatPanel
          caseFileId={caseFile.id}
          viewerRole={isAttorney ? "attorney" : "client"}
          counterpartLabel={
            isAttorney ? personDisplayName(clientProfile) : "Crawford Law"
          }
        />
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
