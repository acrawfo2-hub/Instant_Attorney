import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyAssertionOverrides,
  buildAssertionDescription,
  parseRoadmapAssertions,
} from "./roadmap-assertions.ts";
import type { RoadmapStage } from "./roadmap-types.ts";

const SAMPLE_STAGES: RoadmapStage[] = [
  { key: "decide", title: "Decide", body: "", status: "done" },
  { key: "file", title: "File", body: "", status: "current" },
  { key: "final", title: "Final", body: "", status: "upcoming" },
];

test("buildAssertionDescription records only the client's confirmation, no fabricated facts", () => {
  const desc = buildAssertionDescription("file", "completed");
  assert.match(desc, /^Roadmap · file:/);
  assert.match(desc, /confirmed this step is complete/i);
  // Must NOT invent specifics the client never stated (dates, cause numbers, etc.).
  assert.doesNotMatch(desc.toLowerCase(), /petition|cause number|filed/);
});

test("buildAssertionDescription appends the client's own note verbatim", () => {
  const desc = buildAssertionDescription("file", "completed", "We filed back in March");
  assert.match(desc, /Note: We filed back in March$/);
});

test("parseRoadmapAssertions reads latest-style roadmap facts", () => {
  const facts = [
    "Some unrelated fact",
    "Roadmap · file: Client confirmed this step is complete. Petition was filed.",
    "Roadmap · final: Client indicated they have not reached this step yet.",
  ];
  const map = parseRoadmapAssertions(facts);
  assert.equal(map.get("file"), "completed");
  assert.equal(map.get("final"), "not_yet");
});

test("applyAssertionOverrides marks completed stage done and advances current", () => {
  const assertions = parseRoadmapAssertions([
    "Roadmap · file: Client confirmed this step is complete. Petition was filed.",
  ]);
  const out = applyAssertionOverrides(SAMPLE_STAGES, assertions);
  assert.equal(out.find((s) => s.key === "file")?.status, "done");
  assert.equal(out.find((s) => s.key === "final")?.status, "current");
});

test("applyAssertionOverrides resets done stage on dispute", () => {
  const stages: RoadmapStage[] = [
    { key: "decide", title: "Decide", body: "", status: "done" },
    { key: "file", title: "File", body: "", status: "done" },
    { key: "final", title: "Final", body: "", status: "current" },
  ];
  const assertions = parseRoadmapAssertions([
    "Roadmap · file: Client indicated they have not reached this step yet.",
  ]);
  const out = applyAssertionOverrides(stages, assertions);
  assert.equal(out.find((s) => s.key === "file")?.status, "current");
  assert.equal(out.find((s) => s.key === "final")?.status, "upcoming");
});

test("completing an out-of-order later stage advances 'you are here' past it", () => {
  const stages: RoadmapStage[] = [
    { key: "a", title: "A", body: "", status: "current" },
    { key: "b", title: "B", body: "", status: "upcoming" },
    { key: "c", title: "C", body: "", status: "upcoming" },
    { key: "d", title: "D", body: "", status: "upcoming" },
  ];
  const assertions = parseRoadmapAssertions([
    "Roadmap · c: Client confirmed this step is complete.",
  ]);
  const out = applyAssertionOverrides(stages, assertions);
  const byKey = Object.fromEntries(out.map((s) => [s.key, s.status]));
  // No stranded "current" behind a checked step: everything up to c is done…
  assert.equal(byKey["a"], "done");
  assert.equal(byKey["b"], "done");
  assert.equal(byKey["c"], "done");
  // …and "you are here" moves to the next real step.
  assert.equal(byKey["d"], "current");
});

test("disputing an earlier stage pulls later signal-complete stages back to upcoming", () => {
  const stages: RoadmapStage[] = [
    { key: "a", title: "A", body: "", status: "done" },
    { key: "b", title: "B", body: "", status: "done" },
    { key: "c", title: "C", body: "", status: "done" },
    { key: "d", title: "D", body: "", status: "done" },
  ];
  const assertions = parseRoadmapAssertions([
    "Roadmap · b: Client indicated the roadmap is not accurate here.",
  ]);
  const out = applyAssertionOverrides(stages, assertions);
  const byKey = Object.fromEntries(out.map((s) => [s.key, s.status]));
  // "I'm actually back at b" wins over inferred later progress — no done check
  // lands after the current marker.
  assert.equal(byKey["a"], "done");
  assert.equal(byKey["b"], "current");
  assert.equal(byKey["c"], "upcoming");
  assert.equal(byKey["d"], "upcoming");
});
