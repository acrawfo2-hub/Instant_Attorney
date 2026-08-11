export const DRAFT_JOB_STATES = [
  "preparing",
  "drafting",
  "waiting_for_facts",
  "checking",
  "ready",
  "failed",
  "cancelled",
] as const;

export type DraftJobState = (typeof DRAFT_JOB_STATES)[number];

export interface DraftGenerationJob {
  id: string;
  case_file_id: string;
  user_id: string;
  document_key: string;
  title: string;
  state: DraftJobState;
  missing_fact_labels: string[];
  latest_revision: number;
  workspace_draft_id: string | null;
  failure_code: string | null;
  failure_message: string | null;
  generation_token: string;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
}

export const DRAFT_JOB_LABELS: Record<DraftJobState, string> = {
  preparing: "Preparing structure",
  drafting: "Drafting with known facts",
  waiting_for_facts: "Waiting for your answer",
  checking: "Checking consistency",
  ready: "Working draft ready",
  failed: "Drafting failed",
  cancelled: "Drafting cancelled",
};

export function isActiveDraftJob(state: DraftJobState): boolean {
  return state === "preparing" || state === "drafting" || state === "waiting_for_facts" || state === "checking";
}

/** A completion may only replace the same generation attempt. */
export function acceptsDraftJobResult(
  job: Pick<DraftGenerationJob, "generation_token" | "state">,
  generationToken: string,
): boolean {
  return job.generation_token === generationToken && isActiveDraftJob(job.state);
}

/** Returns each newly-observed ready document, independent of sibling order. */
export function readyDraftTransitions(
  previous: ReadonlyMap<string, DraftJobState>,
  jobs: Array<Pick<DraftGenerationJob, "id" | "state" | "workspace_draft_id">>,
): string[] {
  return jobs
    .filter((job) => job.state === "ready" && previous.get(job.id) !== "ready" && job.workspace_draft_id)
    .map((job) => job.workspace_draft_id as string);
}
