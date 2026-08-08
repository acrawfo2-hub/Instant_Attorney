import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createAcpJob,
  getAcpJob,
  getCurrentAcpJob,
  getActiveAcpJob,
  getPredecessorChain,
  emitAcpChunk,
  finishAcpJob,
  isAcpJobRunning,
} from "./acp-jobs.ts";

test("createAcpJob registers by id and as current for the case", () => {
  const job = createAcpJob("case-1", "user-1");
  assert.equal(getAcpJob(job.id), job);
  assert.equal(getCurrentAcpJob("case-1"), job);
  assert.equal(isAcpJobRunning(job), true);
});

test("a newer job replaces the current pointer but the old one stays fetchable", () => {
  const a = createAcpJob("case-2", "user-1");
  const b = createAcpJob("case-2", "user-1");
  assert.equal(getCurrentAcpJob("case-2"), b);
  assert.equal(getAcpJob(a.id), a);
});

test("rapid sends chain: each job queues behind the unfinished tail", () => {
  const a = createAcpJob("case-chain", "user-1");
  const b = createAcpJob("case-chain", "user-1");
  const c = createAcpJob("case-chain", "user-1");
  assert.equal(a.predecessorId, null);
  assert.equal(b.predecessorId, a.id);
  assert.equal(c.predecessorId, b.id);
  assert.deepEqual(getPredecessorChain(c).map((j) => j.id), [a.id, b.id]);
  // Active job for the case is the OLDEST unfinished one (the real draft),
  // not the queued tail.
  assert.equal(getActiveAcpJob("case-chain")?.id, a.id);
  finishAcpJob(a, { finalText: "reply 1", truncated: false, error: null });
  assert.equal(getActiveAcpJob("case-chain")?.id, b.id);
  finishAcpJob(b, { finalText: "reply 2", truncated: false, error: null });
  finishAcpJob(c, { finalText: "reply 3", truncated: false, error: null });
  // Everything finished: fall back to the tail so a reload can fetch the result.
  assert.equal(getActiveAcpJob("case-chain")?.id, c.id);
});

test("a job does not chain behind a finished tail or another user's job", () => {
  const a = createAcpJob("case-nochain", "user-1");
  finishAcpJob(a, { finalText: "done", truncated: false, error: null });
  const b = createAcpJob("case-nochain", "user-1");
  assert.equal(b.predecessorId, null);
  const other = createAcpJob("case-otheruser", "user-1");
  assert.equal(isAcpJobRunning(other), true);
  const c = createAcpJob("case-otheruser", "user-2");
  assert.equal(c.predecessorId, null);
});

test("finished predecessors' replies stay retrievable through the chain", () => {
  const a = createAcpJob("case-splice", "user-1");
  const b = createAcpJob("case-splice", "user-1");
  finishAcpJob(a, { finalText: "first reply", truncated: false, error: null });
  const chain = getPredecessorChain(b);
  assert.deepEqual(chain.filter((j) => j.done).map((j) => j.finalText), ["first reply"]);
});

test("emitAcpChunk accumulates text and notifies subscribers", () => {
  const job = createAcpJob("case-3", "user-1");
  const seen: string[] = [];
  job.listeners.add((c) => seen.push(c));
  emitAcpChunk(job, "hello ");
  emitAcpChunk(job, "world");
  assert.equal(job.text, "hello world");
  assert.deepEqual(seen, ["hello ", "world"]);
});

test("a throwing subscriber does not break other subscribers", () => {
  const job = createAcpJob("case-4", "user-1");
  const seen: string[] = [];
  job.listeners.add(() => { throw new Error("gone"); });
  job.listeners.add((c) => seen.push(c));
  emitAcpChunk(job, "x");
  assert.deepEqual(seen, ["x"]);
});

test("finishAcpJob resolves the promise and records final state", async () => {
  const job = createAcpJob("case-5", "user-1");
  emitAcpChunk(job, "partial");
  finishAcpJob(job, { finalText: "partial done", truncated: true, error: null });
  await job.promise; // must resolve
  assert.equal(job.done, true);
  assert.equal(job.finalText, "partial done");
  assert.equal(job.truncated, true);
  assert.equal(job.error, null);
  assert.equal(isAcpJobRunning(job), false);
  assert.equal(job.listeners.size, 0);
});

test("finishAcpJob with an error keeps the final text for recovery", async () => {
  const job = createAcpJob("case-6", "user-1");
  finishAcpJob(job, { finalText: "half a reply", truncated: false, error: "model failed" });
  await job.promise;
  assert.equal(job.error, "model failed");
  assert.equal(job.finalText, "half a reply");
});
