import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptsDraftJobResult, DRAFT_JOB_LABELS, isActiveDraftJob, readyDraftTransitions } from "./draft-generation-status.ts";
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
