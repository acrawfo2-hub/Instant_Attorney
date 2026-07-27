import React from "react";
import Link from "next/link";
import MissionControlBoard from "@/components/MissionControlBoard";
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
import type { RoadmapAiOverlay } from "@/lib/roadmap-types";
import PostConsultCard from "@/components/PostConsultCard";
import CaseChatPanel from "@/components/CaseChatPanel";
import CaseHub from "@/components/CaseHub";
import CaseDocumentsTable from "@/components/CaseDocumentsTable";
import AttorneyFreestyleChat from "@/components/AttorneyFreestyleChat";
import { buildMatterTasks } from "@/lib/matter-tasks";
import type { CaseFile, FactItem, Document, Profile, ConsultRequest, ConsultWrapUp, RequestedAttachment, GovFormInstrument, Attachment } from "@/lib/types";
import { docTypeLabel, personDisplayName, coerceWizardType } from "@/lib/types";

// The consumer Living File no longer PRESCRIBES the next step with a computed
// roadmap, Mission Control action board, or per-matter tool cards. "What do I do
// next?" now happens by talking to the orchestrator, which knows every fact and
// can run the same calculators as tools in-conversation. The file is a reference —
// overview + facts + documents. (The attorney view still shows Mission Control.)

// ── Matter badge ─────────────────────────────────────────────────────────────

function MatterBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const label = type === "reactive" ? "Active case" : "Planning ahead";
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
  isAttorneyUser?: boolean;
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
  isAttorneyUser = false,
  clientProfile,
  consultRequest,
  hasConsultSub = false,
  completedConsultWrapUp = null,
  completedConsultSubmittedAt = null,
  roadmapOverlay = {},
}: ClientFileViewProps) {
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
  const isAttorney = mode === "attorney";

  // The consumer file's single live block. Computed server-side from the
  // deterministic task view (Mission Control + finalized records), so "Where
  // things stand" renders instantly — no button, no per-view model call. The
  // orchestrator keeps the underlying facts/documents current; this reads them.
  const matterTasks = !isAttorney
    ? buildMatterTasks({
        caseFile,
        facts,
        documents,
        requestedAttachments,
        govForms,
        attachments,
        mode: "client",
      })
    : null;

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
    recommendConsult: Boolean(strategy?.recommend_consult) && !hasActiveConsult,
    hasConsultSub,
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

      {/* Consult status — client Crawford Law subscribers only */}
      {!isAttorney && !isAttorneyUser && (() => {
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
                  <span className="lf-consult-rec-badge lf-consult-rec-badge-confirmed">Consult confirmed</span>
                  <span className="lf-consult-desc"><strong>{timeStr}</strong> · Andrew will call {cr.client_phone ?? "you"}</span>
                </div>
                <Link href={`/consult/${cr.id}/session`} className="lf-consult-btn">Open consult page →</Link>
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
        if (strategy?.recommend_consult) {
          return (
            <div className="lf-card lf-card-full lf-consult-banner lf-consult-banner-recommended">
              <div className="lf-consult-banner-inner">
                <div className="lf-consult-banner-text">
                  <span className="lf-consult-rec-badge">Consult Recommended</span>
                  <span className="lf-consult-desc">Your attorney has flagged this matter for a live strategy session.</span>
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
        }
        return null;
      })()}

      {/* Post-consult action plan — client mode */}
      {!isAttorney && completedConsultWrapUp && (
        <PostConsultCard
          wrapUp={completedConsultWrapUp}
          submittedAt={completedConsultSubmittedAt}
        />
      )}

      {/* Mission Control — attorney view only; the consumer decides next steps by
          talking to the orchestrator (below) rather than a computed action board. */}
      {isAttorney && (
        <MissionControlBoard
          board={missionBoard}
          caseFileId={caseFile.id}
          mode={mode}
          isAttorneyUser={isAttorneyUser}
        />
      )}

      {/* The consumer file's single live block — consolidates the old recap card,
          the "what's next?" CTA, and the on-demand standing card into one
          server-computed "Where things stand" read of the matter, with the
          assistant one tap away. */}
      {!isAttorney && matterTasks && <CaseHub caseFile={caseFile} tasks={matterTasks} />}

      {/* Attorney parity — the same "keep working with the orchestrator" entry the
          client has, on the file. Opens the freestyle work-product workspace
          (privileged, not shared) right here instead of a separate page. */}
      {isAttorney && (
        <div className="lf-card lf-card-full lf-atty-freestyle-entry">
          <AttorneyFreestyleChat caseFileId={caseFile.id} />
        </div>
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

      <ExistingCounselCard
        caseFileId={caseFile.id}
        counselIntakeAt={caseFile.counsel_intake_at}
        hasExistingCounsel={caseFile.has_existing_counsel}
        existingCounselName={caseFile.existing_counsel_name}
        counselEngagementGoal={caseFile.counsel_engagement_goal}
        mode={isAttorney ? "attorney" : "client"}
      />

      <details className="lf-details-section">
        <summary className="lf-details-summary">
          <span className="lf-details-summary-main">About this matter</span>
          <span className="lf-details-summary-hint">Summary, goals, and strategy — updates as you go</span>
        </summary>
        <div className="lf-details-body">
      {/* Matter */}
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
                {!isAttorney && <span className="lf-plain-caption lf-plain-caption-sub">Documents we can create — start from Mission Control above</span>}
              </div>
              <ul className="lf-list">
                {strategy.instruments.map((inst, i) => (
                  <li key={i}>{inst}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

        </div>
      </details>

      <details className="lf-details-section">
        <summary className="lf-details-summary">
          <span className="lf-details-summary-main">Facts &amp; gaps</span>
          <span className="lf-details-summary-hint">Reference list — answer open items from Mission Control</span>
        </summary>
        <div className="lf-details-body">
      <FactsPanel
        confirmed={confirmed}
        gaps={realGaps}
        placeholderGroups={placeholderGroups}
        isAttorney={isAttorney}
      />
        </div>
      </details>

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


      {/* One concise table — suggested uploads, attachments on file, and drafted
          documents — replaces the old separate Documents card + AttachmentPanel. */}
      <CaseDocumentsTable
        caseFileId={caseFile.id}
        documents={documents}
        childDocuments={childDocuments}
        facts={facts}
        isAttorney={isAttorney}
      />

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
