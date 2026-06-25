import { test } from "node:test";
import assert from "node:assert/strict";
import { buildGenericRoadmap } from "./generic-roadmap.ts";

test("a brand-new matter starts at 'Understand your situation'", () => {
  const rm = buildGenericRoadmap({});
  assert.equal(rm.stages[0].key, "understand");
  assert.equal(rm.stages[0].status, "current");
  assert.ok(rm.stages.slice(1).every((s) => s.status === "upcoming"));
});

test("a summary completes 'understand' and moves to 'build your file'", () => {
  const rm = buildGenericRoadmap({ hasSummary: true });
  const byKey = Object.fromEntries(rm.stages.map((s) => [s.key, s.status]));
  assert.equal(byKey["understand"], "done");
  assert.equal(byKey["build_file"], "current");
});

test("facts gathered with no gaps/uploads completes 'build your file'", () => {
  const rm = buildGenericRoadmap({
    hasSummary: true,
    confirmedFactCount: 5,
    openGapCount: 0,
    pendingUploadCount: 0,
  });
  const byKey = Object.fromEntries(rm.stages.map((s) => [s.key, s.status]));
  assert.equal(byKey["build_file"], "done");
  assert.equal(byKey["documents"], "current");
});

test("open gaps keep 'build your file' current", () => {
  const rm = buildGenericRoadmap({ hasSummary: true, confirmedFactCount: 3, openGapCount: 2 });
  assert.equal(rm.stages.find((s) => s.key === "build_file")!.status, "current");
});

test("a drafted document advances past 'prepare documents' to 'attorney review'", () => {
  const rm = buildGenericRoadmap({
    hasSummary: true,
    documents: [{ status: "pending_review", hasDraft: true }],
  });
  const byKey = Object.fromEntries(rm.stages.map((s) => [s.key, s.status]));
  assert.equal(byKey["documents"], "done");
  assert.equal(byKey["build_file"], "done"); // prerequisite completes once a later stage is reached
  assert.equal(byKey["review"], "current");
});

test("an approved document resolves the matter", () => {
  const rm = buildGenericRoadmap({ hasSummary: true, documents: [{ status: "approved", hasDraft: true }] });
  assert.ok(rm.stages.every((s) => s.status === "done"));
});

test("a booked consult resolves the matter even without documents", () => {
  const rm = buildGenericRoadmap({ hasSummary: true, consultActive: true });
  assert.equal(rm.stages.find((s) => s.key === "resolution")!.status, "done");
});

test("a draft-only document (not pending) still counts as documents started", () => {
  const rm = buildGenericRoadmap({ hasSummary: true, documents: [{ status: "draft", hasDraft: true }] });
  assert.equal(rm.stages.find((s) => s.key === "documents")!.status, "done");
  assert.equal(rm.stages.find((s) => s.key === "review")!.status, "current");
});

test("every stage has title/body; at most one current", () => {
  const rm = buildGenericRoadmap({ hasSummary: true, confirmedFactCount: 1 });
  for (const s of rm.stages) assert.ok(s.title.length > 0 && s.body.length > 0, s.key);
  assert.ok(rm.stages.filter((s) => s.status === "current").length <= 1);
});
