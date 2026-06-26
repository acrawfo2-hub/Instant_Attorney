// ── Generic matter roadmap (Tier 1) ──────────────────────────────────────────
//
// The hybrid roadmap's fallback: a roadmap for ANY matter, derived purely from
// signals the Living File already carries — so a contract, HOA, employment, or
// free-form "other" matter gets a "here's the path, here's where you are" map even
// when there's no authored, area-specific blueprint (family, bankruptcy). Authored
// roadmaps are richer; this guarantees every file has at least this.
//
// The generic arc mirrors the document-production journey every matter follows:
//   Understand → Build your file → Prepare documents → Attorney review → Resolution
//
// Pure and deterministic. Per-stage completion is evidence-based (and a
// prerequisite stage completes once a later one is reached, since the arc is
// genuinely sequential), so "current" is the first stage without evidence.
// General legal information, not legal advice.

import { assignStageStatuses } from "./roadmap-status.ts";

export type StageStatus = "done" | "current" | "upcoming";

export interface RoadmapStage {
  key: string;
  title: string;
  body: string;
  status: StageStatus;
  tip?: string;
}

export interface GenericRoadmap {
  label: string;
  stages: RoadmapStage[];
  disclaimer: string;
}

export interface GenericRoadmapInput {
  /** The intake produced a case summary. */
  hasSummary?: boolean;
  /** Matter type (reactive/preventive) is set. */
  matterTypeKnown?: boolean;
  /** Confirmed (non-gap) facts on file. */
  confirmedFactCount?: number;
  /** Open fact gaps still to answer. */
  openGapCount?: number;
  /** Requested document uploads still outstanding. */
  pendingUploadCount?: number;
  /** A legal strategy / document plan exists. */
  hasDocumentPlan?: boolean;
  /** Documents on file, with status and whether a draft exists. */
  documents?: { status: string; hasDraft?: boolean }[];
  /** A consult is booked or in progress. */
  consultActive?: boolean;
}

const DISCLAIMER =
  "This is a general map of how a legal matter typically progresses, not legal advice. Steps can overlap or repeat, and your specific situation may differ. For some matter types we provide a more detailed, tailored roadmap.";

const DRAFTED_STATUSES = new Set(["pending_review", "in_review", "approved", "delivered", "second_draft"]);
const PENDING_STATUSES = new Set(["pending_review", "in_review"]);
const DONE_STATUSES = new Set(["approved", "delivered"]);

interface Signals {
  understood: boolean;
  fileBuilt: boolean;
  documentsStarted: boolean;
  inReview: boolean;
  resolved: boolean;
}

function deriveSignals(input: GenericRoadmapInput): Signals {
  const docs = input.documents ?? [];
  const anyDraft = docs.some((d) => d.hasDraft || DRAFTED_STATUSES.has(d.status));
  const anyPending = docs.some((d) => PENDING_STATUSES.has(d.status));
  const anyDone = docs.some((d) => DONE_STATUSES.has(d.status));
  const resolved = anyDone || Boolean(input.consultActive);

  const fileBuilt =
    (input.confirmedFactCount ?? 0) > 0 &&
    (input.openGapCount ?? 0) === 0 &&
    (input.pendingUploadCount ?? 0) === 0;

  return {
    understood: Boolean(input.hasSummary) || Boolean(input.matterTypeKnown),
    fileBuilt,
    documentsStarted: anyDraft,
    inReview: anyPending,
    resolved,
  };
}

interface Blueprint {
  key: string;
  title: string;
  body: string;
  tip?: string;
  complete: (s: Signals) => boolean;
}

// Each stage completes on its own evidence OR once any later stage is reached
// (the arc is sequential — you can't have an attorney reviewing a draft you never
// built). The `reachedLater` flags below encode that.
const STAGES: Blueprint[] = [
  {
    key: "understand",
    title: "Understand your situation",
    body: "Tell your story so we can identify what area of law applies and what you're trying to accomplish. This becomes your case summary.",
    complete: (s) => s.understood || s.fileBuilt || s.documentsStarted || s.inReview || s.resolved,
  },
  {
    key: "build_file",
    title: "Build your file",
    body: "Gather the facts, answer the open questions, and upload the documents that matter. A complete file makes everything that follows stronger.",
    tip: "Missing information is normal — gaps are work items, not obstacles.",
    complete: (s) => s.fileBuilt || s.documentsStarted || s.inReview || s.resolved,
  },
  {
    key: "documents",
    title: "Prepare your documents",
    body: "Draft the letters, agreements, or filings your matter needs, using the facts in your file.",
    complete: (s) => s.documentsStarted || s.inReview || s.resolved,
  },
  {
    key: "review",
    title: "Attorney review",
    body: "A document you submit is reviewed by a supervising attorney before it's finalized, so you send something sound.",
    complete: (s) => s.resolved,
  },
  {
    key: "resolution",
    title: "Resolution & next steps",
    body: "Send your finalized document, file it, or book a consult to map out strategy — and decide what, if anything, comes next.",
    complete: (s) => s.resolved,
  },
];

/**
 * Build the generic roadmap for any matter. Deterministic.
 */
export function buildGenericRoadmap(input: GenericRoadmapInput): GenericRoadmap {
  const signals = deriveSignals(input);
  const statuses = assignStageStatuses(STAGES.map((b) => b.complete(signals)));

  const stages: RoadmapStage[] = STAGES.map((b, i) => ({
    key: b.key,
    title: b.title,
    body: b.body,
    status: statuses[i],
    ...(b.tip ? { tip: b.tip } : {}),
  }));

  return { label: "Your Roadmap", stages, disclaimer: DISCLAIMER };
}
