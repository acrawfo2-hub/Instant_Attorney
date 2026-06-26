import { test } from "node:test";
import assert from "node:assert/strict";
import { detectMatterArea, buildMatterRoadmap } from "./matter-roadmap.ts";

// ── Area detection ────────────────────────────────────────────────────────────

test("detectMatterArea routes known subtypes correctly", () => {
  assert.equal(detectMatterArea("hoa dispute"), "hoa");
  assert.equal(detectMatterArea("homeowners association fine"), "hoa");
  assert.equal(detectMatterArea("wrongful termination"), "employment");
  assert.equal(detectMatterArea("wage dispute"), "employment");
  assert.equal(detectMatterArea("estate planning"), "estate");
  assert.equal(detectMatterArea("will drafting", "need a will and trust"), "estate");
  assert.equal(detectMatterArea("consumer_dispute"), "debt");
  assert.equal(detectMatterArea("debt collection"), "debt");
  assert.equal(detectMatterArea("contractor deposit"), "debt");
  assert.equal(detectMatterArea(null, "FDCPA violation by a debt collector"), "debt");
  assert.equal(detectMatterArea(null, null), "general");
  assert.equal(detectMatterArea(""), "general");
});

test("matterText is used as fallback when subtype is null", () => {
  assert.equal(detectMatterArea(null, "my employer discriminated against me"), "employment");
  assert.equal(detectMatterArea(null, "the HOA is fining me for my fence"), "hoa");
  assert.equal(detectMatterArea(null, "I need a power of attorney and a will"), "estate");
});

// ── Debt roadmap ──────────────────────────────────────────────────────────────

test("fresh debt matter starts at document stage", () => {
  const rm = buildMatterRoadmap({ matterSubtype: "consumer_dispute" });
  assert.equal(rm.path, "debt");
  assert.equal(rm.stages[0].status, "current");
  assert.ok(rm.stages.slice(1).every((s) => s.status === "upcoming"));
});

test("demand letter fact advances debt roadmap past demand stage", () => {
  const rm = buildMatterRoadmap({
    matterSubtype: "contractor dispute",
    facts: ["We already sent them a demand letter last week."],
  });
  const demand = rm.stages.find((s) => s.key === "demand")!;
  assert.equal(demand.status, "done");
});

test("court filing marks escalate done", () => {
  const rm = buildMatterRoadmap({
    matterSubtype: "debt",
    facts: ["Filed in small claims court (case number 12345)."],
  });
  const escalate = rm.stages.find((s) => s.key === "escalate")!;
  assert.equal(escalate.status, "done");
});

// ── HOA roadmap ───────────────────────────────────────────────────────────────

test("fresh HOA matter starts at govdocs stage", () => {
  const rm = buildMatterRoadmap({ matterSubtype: "hoa dispute" });
  assert.equal(rm.path, "hoa");
  assert.equal(rm.stages[0].key, "govdocs");
  assert.equal(rm.stages[0].status, "current");
});

test("HOA board escalation advances past board stage", () => {
  const rm = buildMatterRoadmap({
    matterSubtype: "hoa fine",
    facts: ["I sent a written request to the board last month."],
  });
  const board = rm.stages.find((s) => s.key === "board")!;
  assert.equal(board.status, "done");
});

// ── Employment roadmap ────────────────────────────────────────────────────────

test("fresh employment matter starts at document stage", () => {
  const rm = buildMatterRoadmap({ matterSubtype: "wrongful termination" });
  assert.equal(rm.path, "employment");
  assert.equal(rm.stages[0].status, "current");
});

test("EEOC charge fact advances employment roadmap past agency stage", () => {
  const rm = buildMatterRoadmap({
    matterSubtype: "discrimination",
    facts: ["Filed an EEOC charge on March 15."],
  });
  const agency = rm.stages.find((s) => s.key === "agency")!;
  assert.equal(agency.status, "done");
});

// ── Estate roadmap ────────────────────────────────────────────────────────────

test("fresh estate matter starts at inventory stage", () => {
  const rm = buildMatterRoadmap({ matterSubtype: "estate planning" });
  assert.equal(rm.path, "estate");
  assert.equal(rm.stages[0].status, "current");
});

test("drafted will advances estate past draft stage", () => {
  const rm = buildMatterRoadmap({
    matterSubtype: "will drafting",
    documents: [{ title: "Last Will and Testament", status: "draft" }],
  });
  const draft = rm.stages.find((s) => s.key === "draft")!;
  assert.equal(draft.status, "done");
});

test("review stage never auto-completes (requires human action)", () => {
  const rm = buildMatterRoadmap({
    matterSubtype: "estate planning",
    documents: [{ title: "Will", status: "approved" }],
    facts: ["Will signed and notarized. Trust funded."],
  });
  const review = rm.stages.find((s) => s.key === "review")!;
  assert.notEqual(review.status, "done");
});

// ── General roadmap ───────────────────────────────────────────────────────────

test("general roadmap starts at understand when no signals", () => {
  const rm = buildMatterRoadmap({ matterSubtype: null });
  assert.equal(rm.path, "general");
  assert.equal(rm.stages[0].status, "current");
});

test("hasStrategy flag advances general roadmap past strategy stage", () => {
  const rm = buildMatterRoadmap({ matterSubtype: null, hasStrategy: true });
  const strategy = rm.stages.find((s) => s.key === "strategy")!;
  assert.equal(strategy.status, "done");
});

// ── Shared invariants ─────────────────────────────────────────────────────────

test("all area roadmaps have non-empty titles and bodies; at most one current stage", () => {
  const cases: Array<[string | null, string | null]> = [
    ["debt collection", null],
    ["hoa dispute", null],
    ["wrongful termination", null],
    ["estate planning", null],
    [null, null],
  ];
  for (const [sub, text] of cases) {
    const rm = buildMatterRoadmap({ matterSubtype: sub, matterText: text });
    for (const s of rm.stages) {
      assert.ok(s.title.length > 0 && s.body.length > 0, `${sub}/${s.key} missing content`);
    }
    const currents = rm.stages.filter((s) => s.status === "current").length;
    assert.ok(currents <= 1, `${sub} has ${currents} current stages`);
  }
});
