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
import CaseHub from "@/components/CaseHub";
import FileTiles from "@/components/FileTiles";
import FileSection from "@/components/FileSection";
import FileAlertStrip from "@/components/FileAlertStrip";
import AskAssistantBar from "@/components/AskAssistantBar";
import KeyDeadlines from "@/components/KeyDeadlines";
import StrengthCheckCard from "@/components/StrengthCheckCard";
import CaseDocumentsTable from "@/components/CaseDocumentsTable";
import AttorneyFreestyleChat from "@/components/AttorneyFreestyleChat";
import { buildMatterTasks } from "@/lib/matter-tasks";
import { buildFileDeck } from "@/lib/file-deck";
import type { CaseFile, FactItem, Document, Profile, ConsultRequest, ConsultWrapUp, RequestedAttachment, GovFormInstrument, Attachment, ClientWorkspaceDraft } from "@/lib/types";
import { docTypeLabel, personDisplayName, coerceWizardType } from "@/lib/types";
import { FIRM_CONTACT_EMAIL } from "@/lib/firm";

// The consumer Living File is a DECK, not a document. The complaint it answers:
// the page hit the client with a wall of text and buried both the assistant and
// her own finished drafts inside it.
//
// The shape now, in the order a good lawyer walks a client through a matter:
//
//   1. the one date that could hurt          (only when there is one)
//   2. where things stand + ONE next step    (with the biggest button on the page)
//   3. the drafts already written            (one tap, never hunted for)
//   4. six tiles — the map of the file       (same six, same order, live counts)
//   5. documents                             (the working surface)
//   6. everything else, behind its own tile  (dates, details, facts, people)
//
// Nothing was deleted: every card that used to be stacked on the page still
// renders, inside whichever section its tile names. The attorney view keeps its
// own layout (Mission Control + the full reference stack) below.

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
  workspaceDrafts?: ClientWorkspaceDraft[];
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
  workspaceDrafts = [],
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
  const chatHref = `/chat?caseFileId=${caseFile.id}`;

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

  // Everything the client-side layout renders above the fold, distilled from the
  // same rows the sections below display in full. Pure — see lib/file-deck.ts.
  const deck = matterTasks
    ? buildFileDeck({
        caseFile,
        facts,
        tasks: matterTasks,
        documents,
        childDocuments,
        workspaceDrafts,
        attachments,
        requestedAttachments,
        govForms,
        consultRequest,
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

  // ── Shared blocks ──────────────────────────────────────────────────────────
  // Built once, placed differently by each layout. Kept as consts (not inlined)
  // so the client deck can file them behind a tile without duplicating markup.

  const prepBanner = !isAttorney && (() => {
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
  })();

  // Consult status — client Crawford Law subscribers only. One compact,
  // data-driven strip instead of four near-identical full-width banners.
  const consultStrip = !isAttorney && !isAttorneyUser && (() => {
    const cr = consultRequest;
    const fmt = (iso: string, weekday: "long" | "short", month: "long" | "short") =>
      new Date(iso).toLocaleString("en-US", {
        timeZone: "America/Chicago", weekday, month, day: "numeric",
        hour: "numeric", minute: "2-digit", timeZoneName: "short",
      });

    let tone = "", label = "";
    let message: React.ReactNode = null;
    let action: { label: string; href: string } | null = null;

    if (cr?.status === "confirmed" && cr.confirmed_time) {
      tone = "green"; label = "Consult confirmed";
      message = <><strong>{fmt(cr.confirmed_time, "long", "long")}</strong> · Andrew will call {cr.client_phone ?? "you"}</>;
      action = { label: "Open consult page", href: `/consult/${cr.id}/session` };
    } else if (cr?.status === "attorney_proposed" && cr.attorney_proposed_time) {
      tone = "amber"; label = "New time proposed";
      message = <>Andrew suggested <strong>{fmt(cr.attorney_proposed_time, "short", "short")}</strong></>;
      action = { label: "Respond", href: "/dashboard#consult-status" };
    } else if (cr?.status === "pending") {
      tone = "blue"; label = "Awaiting confirmation";
      message = "Your 3 preferred times are in — Andrew will confirm one shortly.";
    } else if (strategy?.recommend_consult) {
      tone = "gold"; label = "Consult recommended";
      message = "Your attorney flagged this matter for a live strategy session.";
      action = {
        label: hasConsultSub ? "Schedule consult" : "Schedule consult · $49.99",
        href: hasConsultSub ? "/consult/schedule" : "/register?upgrade=consult",
      };
    } else {
      return null;
    }

    return (
      <div className={`lf-consult-strip lf-consult-${tone}`} role="status">
        <span className="lf-consult-dot" aria-hidden />
        <div className="lf-consult-strip-body">
          <span className="lf-consult-strip-label">{label}</span>
          <span className="lf-consult-strip-msg">{message}</span>
        </div>
        {action && <Link href={action.href} className="lf-consult-strip-cta">{action.label} →</Link>}
      </div>
    );
  })();

  const documentsTable = (
    <CaseDocumentsTable
      caseFileId={caseFile.id}
      documents={documents}
      childDocuments={childDocuments}
      facts={facts}
      isAttorney={isAttorney}
      initialWorkspaceDrafts={workspaceDrafts}
    />
  );

  // "About this matter" — the reference read of the case. Reference, not a to-do
  // list: it belongs behind the Case details tile, never in front of the client
  // on arrival.
  const aboutBlocks = (
    <>
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

      {caseFile.summary && (
        <div className="lf-card lf-card-full">
          <div className="lf-card-label">Case Summary</div>
          <p className="lf-summary">{caseFile.summary}</p>
        </div>
      )}

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
                {!isAttorney && <span className="lf-plain-caption lf-plain-caption-sub">Documents we can create — ask for one in your legal chat</span>}
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
    </>
  );

  const factsBlocks = (
    <>
      <FactsPanel
        confirmed={confirmed}
        gaps={realGaps}
        placeholderGroups={placeholderGroups}
        isAttorney={isAttorney}
      />

      {/* Contingency preferences from the What-If Game — hypothetical, not facts.
          Folded in here as a subsection of the reference list rather than a
          separate card. */}
      {hypotheticals.length > 0 && (
        <div className="lf-facts-contingency" id="contingency-preferences">
          <div className="lf-facts-contingency-head">
            Contingency preferences
            <span className="lf-count">{hypotheticals.length}</span>
          </div>
          <p className="lf-plain-caption">
            {isAttorney
              ? "Hypothetical intentions from the What-If Game — not asserted facts."
              : "Your wishes for “what if…” situations — used to add backup plans to your documents, not treated as facts."}
          </p>
          <ul className="lf-list">
            {hypotheticals.map((f) => (
              <li key={f.id}>{f.description.replace(/^What-if · /i, "")}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  const attorneyAssessment = (
    <div className="lf-card lf-card-full">
      <div className="lf-card-label">Attorney Assessment</div>
      {caseFile.attorney_assessment ? (
        <p className="lf-assessment">{caseFile.attorney_assessment}</p>
      ) : (
        <p className="lf-empty-field">Crawford Law will add an assessment once your intake is complete.</p>
      )}
    </div>
  );

  // ── Client layout — the deck ───────────────────────────────────────────────

  if (!isAttorney && matterTasks && deck) {
    return (
      <div className="lf-grid">
        {prepBanner}
        {deck.pressing && <FileAlertStrip pressing={deck.pressing} chatHref={chatHref} />}
        {consultStrip}

        {completedConsultWrapUp && (
          <PostConsultCard
            wrapUp={completedConsultWrapUp}
            submittedAt={completedConsultSubmittedAt}
          />
        )}

        <CaseHub caseFile={caseFile} tasks={matterTasks} deck={deck} />

        <FileTiles tiles={deck.tiles} />

        {documentsTable}

        {deck.docketCount > 0 && (
          <FileSection
            id="deadlines"
            title="Key dates"
            hint="Every deadline we can compute from the dates on your file, and what each one is based on"
          >
            <KeyDeadlines facts={facts} jurisdiction={caseFile.jurisdiction} />
          </FileSection>
        )}

        <FileSection
          id="case-details"
          title="Your case details"
          hint="What this matter is about, what you want out of it, and the strategy — updates as you go"
        >
          {aboutBlocks}
        </FileSection>

        <FileSection
          id="facts"
          title="Facts on file"
          hint="What's confirmed, what's still open, and your what-if preferences"
        >
          {factsBlocks}
        </FileSection>

        <FileSection
          id="strength"
          title="How strong is my position?"
          hint="An honest, adversarial read of your case — run it whenever the facts change"
        >
          <StrengthCheckCard
            caseFileId={caseFile.id}
            check={caseFile.legal_strategy?.strength_check ?? null}
            isAttorney={false}
          />
        </FileSection>

        <FileSection
          id="help"
          title="Talk to a person"
          hint="Reach the firm, tell us about a lawyer you've already hired, and read your attorney's assessment"
        >
          <ExistingCounselCard
            caseFileId={caseFile.id}
            counselIntakeAt={caseFile.counsel_intake_at}
            hasExistingCounsel={caseFile.has_existing_counsel}
            existingCounselName={caseFile.existing_counsel_name}
            counselEngagementGoal={caseFile.counsel_engagement_goal}
            mode="client"
          />

          <div className="lf-card lf-card-full lf-contact-card">
            <div className="lf-card-label">Questions?</div>
            <p className="lf-contact-text">
              Email us at{" "}
              <a className="lf-contact-email" href={`mailto:${FIRM_CONTACT_EMAIL}`}>{FIRM_CONTACT_EMAIL}</a>{" "}
              and we&apos;ll get back to you.
            </p>
          </div>

          {attorneyAssessment}
        </FileSection>

        <AskAssistantBar href={chatHref} />
      </div>
    );
  }

  // ── Attorney layout — the full reference stack ─────────────────────────────

  return (
    <div className="lf-grid">
      <MissionControlBoard
        board={missionBoard}
        caseFileId={caseFile.id}
        mode={mode}
        isAttorneyUser={isAttorneyUser}
      />

      {/* Key deadlines — the deterministic docket, computed from dated facts.
          Top placement: a live or passed deadline is the one thing the file must
          never let the attorney scroll past. */}
      <KeyDeadlines facts={facts} jurisdiction={caseFile.jurisdiction} />

      {/* Strength Check — the adversarial stress test. The attorney sees the same
          stored result the client was shown. */}
      <StrengthCheckCard
        caseFileId={caseFile.id}
        check={caseFile.legal_strategy?.strength_check ?? null}
        isAttorney
      />

      {/* Attorney parity — the same "keep working with the orchestrator" entry the
          client has, on the file. Opens the freestyle work-product workspace
          (privileged, not shared) right here instead of a separate page. */}
      <div className="lf-card lf-card-full lf-atty-freestyle-entry">
        <AttorneyFreestyleChat caseFileId={caseFile.id} />
      </div>

      {clientProfile && (
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
        mode="attorney"
      />

      <details className="lf-details-section">
        <summary className="lf-details-summary">
          <span className="lf-details-summary-main">About this matter</span>
          <span className="lf-details-summary-hint">Summary, goals, and strategy — updates as you go</span>
        </summary>
        <div className="lf-details-body">{aboutBlocks}</div>
      </details>

      <details className="lf-details-section">
        <summary className="lf-details-summary">
          <span className="lf-details-summary-main">Facts &amp; gaps</span>
          <span className="lf-details-summary-hint">Reference list — what&apos;s known, what&apos;s still open, and the client&apos;s what-if preferences</span>
        </summary>
        <div className="lf-details-body">{factsBlocks}</div>
      </details>

      {documentsTable}

      {attorneyAssessment}
    </div>
  );
}
