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

/** Map a `document_generation_jobs.status` onto the UI state machine. */
export function jobStateFromGenerationStatus(status: string): DraftJobState {
  if (status === "queued") return "preparing";
  if ((DRAFT_JOB_STATES as readonly string[]).includes(status)) return status as DraftJobState;
  return "preparing";
}

/** Row shape of the live generation table, which the status UI used to ignore. */
export interface DocumentGenerationJobRow {
  id: string;
  case_file_id: string;
  user_id: string;
  document_type: string;
  title: string;
  status: string;
  workspace_draft_id: string | null;
  error: string | null;
  generation_attempt: number;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
}

export function draftJobFromGenerationRow(row: DocumentGenerationJobRow): DraftGenerationJob {
  return {
    id: row.id,
    case_file_id: row.case_file_id,
    user_id: row.user_id,
    document_key: row.document_type,
    title: row.title,
    state: jobStateFromGenerationStatus(row.status),
    missing_fact_labels: [],
    latest_revision: row.generation_attempt,
    workspace_draft_id: row.workspace_draft_id,
    failure_code: null,
    failure_message: row.error,
    generation_token: String(row.generation_attempt),
    started_at: row.started_at ?? row.created_at,
    updated_at: row.updated_at,
    finished_at: row.completed_at,
  };
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
