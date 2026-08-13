// In-process registry for background chat-acp generation jobs.
//
// A "job" is one orchestrator turn (model stream + tool loop + persistence).
// The generation runs detached from the HTTP response: if the browser
// disconnects or the user navigates away, the run continues to completion and
// its results (assistant message, drafts, file updates) are persisted exactly
// as if the client had stayed connected. The client can re-attach via the
// status endpoint (`/api/chat-acp/status`) to pick up the finished text.
//
// This registry is only the live streaming/executor layer. Queue order,
// lifecycle, errors, and delivery are durable in chat_acp_jobs; after a process
// restart the status endpoint reconciles those rows with persisted messages.

import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import type { DraftPersistenceResult } from "@/lib/draft-persistence";

export interface AcpJob {
  id: string;
  caseFileId: string;
  userId: string;
  /** The job this turn queued behind (still-unfinished tail at creation time). */
  predecessorId: string | null;
  /** Monotonic, per-case ordering key persisted with the job. */
  sequence: number;
  startedAt: number;
  /** Raw accumulated stream text, including tool markers. */
  text: string;
  done: boolean;
  error: string | null;
  /** Full raw model response once done (markers included). */
  finalText: string | null;
  truncated: boolean;
  draftPersistence: DraftPersistenceResult;
  finishedAt: number | null;
  /** Resolves when the job finishes (success or failure). */
  promise: Promise<void>;
  listeners: Set<(chunk: string) => void>;
  _resolve: () => void;
}

interface Registry {
  byId: Map<string, AcpJob>;
  currentByCase: Map<string, string>; // caseFileId -> jobId
}

// Survive dev-mode module reloads.
const g = globalThis as unknown as { __acpJobs?: Registry };
const registry: Registry = g.__acpJobs ?? {
  byId: new Map(),
  currentByCase: new Map(),
};
g.__acpJobs = registry;

// Keep finished jobs around long enough for a polling client to fetch the
// final text, then evict.
const FINISHED_TTL_MS = 15 * 60 * 1000;
// Safety net: a job that never finished (crashed without reaching finish)
// stops reporting as running after this long.
const STALE_RUNNING_MS = 30 * 60 * 1000;

function sweep() {
  const now = Date.now();
  for (const [id, job] of registry.byId) {
    const expired =
      (job.done && job.finishedAt && now - job.finishedAt > FINISHED_TTL_MS) ||
      (!job.done && now - job.startedAt > STALE_RUNNING_MS);
    if (expired) {
      registry.byId.delete(id);
      if (registry.currentByCase.get(job.caseFileId) === id) {
        registry.currentByCase.delete(job.caseFileId);
      }
    }
  }
}

export function createAcpJob(caseFileId: string, userId: string, durable?: {
  id: string; sequence: number; predecessorId?: string | null; startedAt?: number;
}): AcpJob {
  sweep();
  // Queue behind the current tail when it hasn't finished yet — turns for one
  // case file execute strictly in order (each waits for its predecessor, so
  // waiting is transitive across the whole chain).
  const tail = getCurrentAcpJob(caseFileId);
  const predecessorId = durable?.predecessorId !== undefined
    ? durable.predecessorId
    : tail && !tail.done && tail.userId === userId ? tail.id : null;
  let _resolve!: () => void;
  const promise = new Promise<void>((res) => { _resolve = res; });
  const job: AcpJob = {
    id: durable?.id ?? randomUUID(),
    caseFileId,
    userId,
    predecessorId,
    sequence: durable?.sequence ?? ((tail?.sequence ?? 0) + 1),
    startedAt: durable?.startedAt ?? Date.now(),
    text: "",
    done: false,
    error: null,
    finalText: null,
    truncated: false,
    draftPersistence: { persisted: [], failed: [] },
    finishedAt: null,
    promise,
    listeners: new Set(),
    _resolve,
  };
  registry.byId.set(job.id, job);
  registry.currentByCase.set(caseFileId, job.id);
  return job;
}

// The durable-queue helpers accept either Supabase client this app builds
// (request-scoped or service-role), so they take the library's own type rather
// than a hand-rolled structural stand-in typed with `any`.
type DbClient = SupabaseClient;

/** Create the durable queue row before exposing the in-process streaming job. */
export async function createDurableAcpJob(db: DbClient, caseFileId: string, userId: string): Promise<AcpJob> {
  const id = randomUUID();
  const { data, error } = await db.rpc("create_chat_acp_job", {
    p_id: id, p_case_file_id: caseFileId, p_user_id: userId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return createAcpJob(caseFileId, userId, {
    id, sequence: row.sequence, predecessorId: row.predecessor_id,
    startedAt: Date.parse(row.started_at),
  });
}

/** Mirror terminal state only after message/draft persistence has settled. */
export async function finishDurableAcpJob(
  db: DbClient,
  job: AcpJob,
  opts: { finalText: string; truncated: boolean; error?: string | null; assistantMessageId?: string | null },
) {
  finishAcpJob(job, opts);
  const state = opts.error ? "failed" : "completed";
  const { error } = await db.from("chat_acp_jobs").update({
    state, final_text: opts.finalText, truncated: opts.truncated,
    error: opts.error ?? null, assistant_message_id: opts.assistantMessageId ?? null,
    finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }).eq("id", job.id).eq("user_id", job.userId);
  if (error) console.error("[chat-acp] durable job finish error:", error);
}

export function getAcpJob(jobId: string): AcpJob | null {
  return registry.byId.get(jobId) ?? null;
}

/** The newest job for the case (tail of the queue). */
export function getCurrentAcpJob(caseFileId: string): AcpJob | null {
  const id = registry.currentByCase.get(caseFileId);
  return id ? registry.byId.get(id) ?? null : null;
}

/**
 * The job's still-registered predecessors, oldest first. Swept/expired links
 * simply end the walk — their results are already persisted in the DB.
 */
export function getPredecessorChain(job: AcpJob): AcpJob[] {
  const chain: AcpJob[] = [];
  let cur = job.predecessorId ? registry.byId.get(job.predecessorId) : undefined;
  while (cur) {
    chain.push(cur);
    cur = cur.predecessorId ? registry.byId.get(cur.predecessorId) : undefined;
  }
  return chain.reverse();
}

/**
 * The job actually generating (or about to) for a case: the OLDEST unfinished
 * job in the chain. Falls back to the tail when everything is finished, so a
 * reload can still fetch the last result. Reload recovery should attach here,
 * not to a queued turn that hasn't started.
 */
export function getActiveAcpJob(caseFileId: string): AcpJob | null {
  const tail = getCurrentAcpJob(caseFileId);
  if (!tail) return null;
  const chain = [...getPredecessorChain(tail), tail];
  return chain.find((j) => !j.done && isAcpJobRunning(j)) ?? tail;
}

/** Append a chunk to the job transcript and fan it out to live subscribers. */
export function emitAcpChunk(job: AcpJob, chunk: string) {
  job.text += chunk;
  for (const cb of job.listeners) {
    try { cb(chunk); } catch { /* subscriber gone */ }
  }
}

export function finishAcpJob(job: AcpJob, opts: { finalText: string; truncated: boolean; error?: string | null }) {
  job.finalText = opts.finalText;
  job.truncated = opts.truncated;
  job.error = opts.error ?? null;
  job.done = true;
  job.finishedAt = Date.now();
  job.listeners.clear();
  job._resolve();
}

/** True while the job is still generating and hasn't gone stale. */
export function isAcpJobRunning(job: AcpJob): boolean {
  return !job.done && Date.now() - job.startedAt <= STALE_RUNNING_MS;
}

/** How long a job may run before the admin health check calls it stuck. */
export const ACP_JOB_STUCK_MS = 5 * 60 * 1000;

export interface AcpJobSnapshot {
  id: string;
  caseFileId: string;
  userId: string;
  ageMs: number;
  done: boolean;
  error: string | null;
  /** Unfinished and running longer than a real turn plausibly takes. */
  stuck: boolean;
}

/**
 * Every job currently in the registry, for the admin health check.
 *
 * Read-only and allocation-light: this runs on every Health page load. Because
 * the registry is in-process, a server restart empties it — that reports as
 * "nothing running", which is accurate, not a gap to paper over.
 */
export function listAcpJobs(): AcpJobSnapshot[] {
  const now = Date.now();
  return [...registry.byId.values()].map((job) => ({
    id: job.id,
    caseFileId: job.caseFileId,
    userId: job.userId,
    ageMs: now - job.startedAt,
    done: job.done,
    error: job.error,
    stuck: !job.done && now - job.startedAt > ACP_JOB_STUCK_MS,
  }));
}
