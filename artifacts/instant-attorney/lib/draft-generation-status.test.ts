import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsDraftJobResult, DRAFT_JOB_LABELS, draftJobFromGenerationRow, isActiveDraftJob, jobStateFromGenerationStatus, readyDraftTransitions } from "./draft-generation-status.ts";
import type { DraftJobState } from "./draft-generation-status.ts";

test("uses careful working-draft status language", () => {
  assert.deepEqual(Object.values(DRAFT_JOB_LABELS).slice(0, 5), [
    "Preparing structure", "Drafting with known facts", "Waiting for your answer",
    "Checking consistency", "Working draft ready",
  ]);
  assert.equal(Object.values(DRAFT_JOB_LABELS).some((label) => /attorney-reviewed|final/i.test(label)), false);
});

test("three simultaneous jobs complete out of order without waiting for a failed sibling", () => {
  const previous = new Map<string, DraftJobState>([["one", "drafting"], ["two", "checking"], ["three", "drafting"]]);
  const jobs = [
    { id: "one", state: "drafting" as const, workspace_draft_id: null },
    { id: "two", state: "ready" as const, workspace_draft_id: "draft-two" },
    { id: "three", state: "failed" as const, workspace_draft_id: null },
  ];
  assert.deepEqual(readyDraftTransitions(previous, jobs), ["draft-two"]);
  const reconnected = new Map<string, DraftJobState>();
  assert.deepEqual(readyDraftTransitions(reconnected, jobs), ["draft-two"]);
  assert.deepEqual(readyDraftTransitions(new Map([["two", "ready"]]), jobs), []);
});

test("terminal, cancelled, and superseded attempts reject stale results", () => {
  const base = { generation_token: "new", state: "drafting" as const };
  assert.equal(acceptsDraftJobResult(base, "new"), true);
  assert.equal(acceptsDraftJobResult(base, "old"), false);
  assert.equal(acceptsDraftJobResult({ ...base, state: "cancelled" }, "new"), false);
  assert.equal(acceptsDraftJobResult({ ...base, state: "ready" }, "new"), false);
  assert.equal(isActiveDraftJob("failed"), false);
});

test("queued generation jobs present as preparing so the card exists before claim", () => {
  assert.equal(jobStateFromGenerationStatus("queued"), "preparing");
  assert.equal(isActiveDraftJob("preparing"), true);
  const job = draftJobFromGenerationRow({
    id: "job-1",
    case_file_id: "case-1",
    user_id: "user-1",
    document_type: "demand_letter",
    title: "Demand Letter",
    status: "queued",
    workspace_draft_id: "draft-1",
    error: null,
    generation_attempt: 0,
    created_at: "2026-08-13T00:00:00Z",
    started_at: null,
    updated_at: "2026-08-13T00:00:00Z",
    completed_at: null,
  });
  assert.equal(job.state, "preparing");
  assert.equal(job.workspace_draft_id, "draft-1");
  assert.equal(job.failure_message, null);
});

test("a failed generation job keeps its shell id and surfaces the error", () => {
  const job = draftJobFromGenerationRow({
    id: "job-1",
    case_file_id: "case-1",
    user_id: "user-1",
    document_type: "demand_letter",
    title: "Demand Letter",
    status: "failed",
    workspace_draft_id: "draft-1",
    error: "The draft was cut off before it finished. Retry to regenerate it.",
    generation_attempt: 1,
    created_at: "2026-08-13T00:00:00Z",
    started_at: "2026-08-13T00:00:01Z",
    updated_at: "2026-08-13T00:00:02Z",
    completed_at: "2026-08-13T00:00:02Z",
  });
  assert.equal(job.state, "failed");
  assert.equal(isActiveDraftJob(job.state), false);
  assert.match(job.failure_message ?? "", /cut off/);
});
