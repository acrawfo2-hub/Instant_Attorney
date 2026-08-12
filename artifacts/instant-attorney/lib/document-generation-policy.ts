/** Policy primitives for proactive document generation.
 *
 * This module deliberately does not generate or persist documents. Callers must
 * store successful output in WORKSPACE_DRAFT_TABLE; only the existing promotion
 * endpoint may create a `documents` or attorney-review row.
 */

export const MAX_ACTIVE_GENERATIONS_PER_CASE = 3;
export const WORKSPACE_DRAFT_TABLE = "client_workspace_drafts" as const;

export type PlanConfidence = "low" | "medium" | "high";
export type DraftingIntent = "none" | "package" | "single_document";
export type LaunchReason = "user_requested" | "package_confirmed" | "strategy_confirmed";
export type GenerationOutcome =
  | "generated"
  | "opened"
  | "edited"
  | "promoted"
  | "cancelled"
  | "discarded";

export interface GenerationEligibilityInput {
  userDraftingIntent: DraftingIntent;
  planConfidence: PlanConfidence;
  /** Zero is the lead document; larger values run later. */
  documentPriority: number;
  /** Fraction of required facts available, from 0 through 1. */
  requiredFactCoverage: number;
  estimatedModelCost: number;
  activeJobCount: number;
  duplicatesWorkspaceDraft: boolean;
  duplicatesPromotedDocument: boolean;
  /** Whether the user explicitly confirmed this particular medium-confidence instrument. */
  instrumentConfirmed: boolean;
}

export interface GenerationPolicyConfig {
  confidenceFloor: PlanConfidence;
  minimumFactCoverage: number;
  maximumEstimatedModelCost: number;
}

export type EligibilityDecision =
  | { eligible: true; requiresConfirmation: false; schedulingPriority: number; launchReason: LaunchReason }
  | { eligible: false; requiresConfirmation: boolean; code: RejectionCode };

export type RejectionCode =
  | "no_drafting_intent"
  | "below_confidence_floor"
  | "confirmation_required"
  | "insufficient_facts"
  | "cost_limit_exceeded"
  | "case_active_limit_reached"
  | "duplicate_workspace_draft"
  | "duplicate_promoted_document";

const CONFIDENCE_RANK: Record<PlanConfidence, number> = { low: 0, medium: 1, high: 2 };

export function evaluateGenerationEligibility(
  input: GenerationEligibilityInput,
  config: GenerationPolicyConfig,
): EligibilityDecision {
  if (input.userDraftingIntent === "none") return reject("no_drafting_intent");
  if (CONFIDENCE_RANK[input.planConfidence] < CONFIDENCE_RANK[config.confidenceFloor]) {
    return reject("below_confidence_floor");
  }
  if (input.planConfidence === "medium" && !input.instrumentConfirmed) {
    return { eligible: false, requiresConfirmation: true, code: "confirmation_required" };
  }
  if (input.requiredFactCoverage < config.minimumFactCoverage) return reject("insufficient_facts");
  if (input.estimatedModelCost > config.maximumEstimatedModelCost) return reject("cost_limit_exceeded");
  if (input.activeJobCount >= MAX_ACTIVE_GENERATIONS_PER_CASE) return reject("case_active_limit_reached");
  if (input.duplicatesPromotedDocument) return reject("duplicate_promoted_document");
  if (input.duplicatesWorkspaceDraft) return reject("duplicate_workspace_draft");

  const launchReason: LaunchReason = input.userDraftingIntent === "single_document"
    ? "user_requested"
    : input.instrumentConfirmed
      ? "package_confirmed"
      : "strategy_confirmed";

  return {
    eligible: true,
    requiresConfirmation: false,
    // A lead always sorts ahead of every non-lead; confidence/facts must never
    // accidentally invert the document plan's explicit order.
    schedulingPriority: Math.max(0, input.documentPriority),
    launchReason,
  };
}

function reject(code: RejectionCode): EligibilityDecision {
  return { eligible: false, requiresConfirmation: false, code };
}

export type GenerationJobStatus = "queued" | "running" | "completed" | "cancelled" | "superseded" | "failed";

export interface GenerationJob {
  id: string;
  documentKey: string;
  revision: number;
  status: GenerationJobStatus;
  schedulingPriority: number;
}

/** Cancel queued work made obsolete by a new plan; running work is superseded. */
export function supersedeJobs(
  jobs: readonly GenerationJob[],
  currentRevision: number,
  plannedDocumentKeys: ReadonlySet<string>,
): GenerationJob[] {
  return jobs.map((job) => {
    const obsolete = job.revision < currentRevision || !plannedDocumentKeys.has(job.documentKey);
    if (!obsolete) return { ...job };
    if (job.status === "queued") return { ...job, status: "cancelled" };
    if (job.status === "running") return { ...job, status: "superseded" };
    return { ...job };
  });
}

/** Workers may finish computation, but must call this immediately before writing. */
export function mayPersistGeneration(job: GenerationJob, currentRevision: number): boolean {
  return job.status === "running" && job.revision === currentRevision;
}

export function orderGenerationQueue(jobs: readonly GenerationJob[]): GenerationJob[] {
  return [...jobs].sort((a, b) => a.schedulingPriority - b.schedulingPriority || a.id.localeCompare(b.id));
}

export interface DocumentOutcomeEvent {
  documentType: string;
  outcome: GenerationOutcome;
}

export type DocumentOutcomeMetrics = Record<string, Record<GenerationOutcome, number>>;

/** Produces per-type funnels suitable for threshold/package tuning. */
export function aggregateDocumentOutcomes(events: readonly DocumentOutcomeEvent[]): DocumentOutcomeMetrics {
  const metrics: DocumentOutcomeMetrics = {};
  for (const { documentType, outcome } of events) {
    metrics[documentType] ??= { generated: 0, opened: 0, edited: 0, promoted: 0, cancelled: 0, discarded: 0 };
    metrics[documentType][outcome] += 1;
  }
  return metrics;
}
