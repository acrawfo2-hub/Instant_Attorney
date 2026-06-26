import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEmploymentRoadmap } from "./employment-roadmap.ts";

test("a fresh matter starts at 'Document & preserve'", () => {
  const rm = buildEmploymentRoadmap({ matterText: "I was fired and think it was discrimination" });
  assert.equal(rm.stages[0].key, "document");
  assert.equal(rm.stages[0].status, "current");
  assert.ok(rm.stages.slice(1).every((s) => s.status === "upcoming"));
});

test("a claim-assessment fact advances past 'document' and 'assess'", () => {
  const rm = buildEmploymentRoadmap({
    matterText: "discrimination",
    facts: ["Employment claim assessment: Possible claim(s): Discrimination (Title VII / TCHRA)"],
  });
  const byKey = Object.fromEntries(rm.stages.map((s) => [s.key, s.status]));
  assert.equal(byKey["document"], "done");
  assert.equal(byKey["assess"], "done");
  // 'internal' is listed before 'assess' but its own signal isn't met. Cascade-back
  // keeps the spine monotone — it's marked done once the later 'assess' step is
  // reached, so no check ever sits after the "you are here" marker — and the
  // current action becomes the first genuinely-unmet step, the agency charge.
  assert.equal(byKey["internal"], "done");
  assert.equal(byKey["charge"], "current");
});

test("a filed charge advances to investigation; right-to-sue and lawsuit still ahead", () => {
  const rm = buildEmploymentRoadmap({
    matterText: "discrimination",
    documents: [{ title: "Charge of Discrimination", status: "delivered" }],
  });
  const byKey = Object.fromEntries(rm.stages.map((s) => [s.key, s.status]));
  assert.equal(byKey["charge"], "done");
  assert.equal(byKey["investigation"], "current");
  assert.equal(byKey["lawsuit"], "upcoming");
});

test("a filed lawsuit marks the whole path done", () => {
  const rm = buildEmploymentRoadmap({ matterText: "discrimination lawsuit filed in court" });
  assert.ok(rm.stages.every((s) => s.status === "done"));
});

test("a draft (not delivered) charge does not count as filed", () => {
  const rm = buildEmploymentRoadmap({
    matterText: "discrimination",
    documents: [{ title: "Charge of Discrimination", status: "draft" }],
  });
  assert.notEqual(rm.stages.find((s) => s.key === "charge")!.status, "done");
});

test("every stage has a title and body; at most one current", () => {
  const rm = buildEmploymentRoadmap({ matterText: "wrongful termination" });
  for (const s of rm.stages) assert.ok(s.title.length > 0 && s.body.length > 0, s.key);
  assert.ok(rm.stages.filter((s) => s.status === "current").length <= 1);
});
