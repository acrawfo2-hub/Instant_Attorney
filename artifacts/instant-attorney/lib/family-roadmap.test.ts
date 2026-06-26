import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFamilyRoadmap,
  detectFamilyPath,
} from "./family-roadmap.ts";

// ── matterSubtype-based path detection ────────────────────────────────────────

test("matterSubtype overrides text-based detection", () => {
  // Subtype wins even when the free text says something different
  assert.equal(detectFamilyPath("divorce with kids", "modification"), "modification");
  assert.equal(detectFamilyPath("I need help", "sapcr"), "custody");
  assert.equal(detectFamilyPath("", "enforcement"), "enforcement");
  assert.equal(detectFamilyPath("", "prenuptial agreement"), "agreement");
  assert.equal(detectFamilyPath("", "divorce"), "divorce");
});

test("matterSubtype handles AI phrasing variations (substrings)", () => {
  assert.equal(detectFamilyPath(null, "divorce with children"), "divorce");
  assert.equal(detectFamilyPath(null, "modifying child support order"), "modification");
  assert.equal(detectFamilyPath(null, "enforce contempt arrears"), "enforcement");
  assert.equal(detectFamilyPath(null, "custody and conservatorship"), "custody");
  assert.equal(detectFamilyPath(null, "premarital agreement"), "agreement");
});

test("matterSubtype null falls back to text keyword scan", () => {
  assert.equal(detectFamilyPath("motion to modify custody", null), "modification");
  assert.equal(detectFamilyPath("prenup before wedding", null), "agreement");
  assert.equal(detectFamilyPath("behind on support denied visitation", null), "enforcement");
});

test("buildFamilyRoadmap uses matterSubtype when provided", () => {
  // Even if matterText says nothing useful, subtype should drive path
  const rm = buildFamilyRoadmap({ matterSubtype: "enforcement", matterText: "" });
  assert.equal(rm.path, "enforcement");
  assert.ok(rm.stages.some((s) => s.key === "document"));
  assert.ok(rm.stages.some((s) => s.key === "hearing"));
});

// ── Expanded signal detection ─────────────────────────────────────────────────

test("real-world petition language marks file stage done", () => {
  const rm = buildFamilyRoadmap({
    matterText: "divorce with kids",
    facts: ["The petition was filed last year (cause number 2024-12345)."],
  });
  const file = rm.stages.find((s) => s.key === "file")!;
  assert.equal(file.status, "done");
});

test("real-world mediation language marks mediation stage done", () => {
  const rm = buildFamilyRoadmap({
    matterText: "divorce with kids",
    facts: ["We went to mediation in February and reached an MSA."],
  });
  const med = rm.stages.find((s) => s.key === "mediation")!;
  assert.equal(med.status, "done");
});

test("'divorce is final' language marks final stage done", () => {
  const rm = buildFamilyRoadmap({
    matterText: "divorce",
    facts: ["The divorce was finalized in December."],
  });
  const final = rm.stages.find((s) => s.key === "final")!;
  assert.equal(final.status, "done");
});

test("'already have temporary orders' marks temporary stage done", () => {
  const rm = buildFamilyRoadmap({
    matterText: "divorce with kids",
    facts: ["We already have a temporary order in place covering custody and support."],
  });
  const temp = rm.stages.find((s) => s.key === "temporary")!;
  assert.equal(temp.status, "done");
});

test("detectFamilyPath routes the major matter types", () => {
  assert.equal(detectFamilyPath("divorce with two kids"), "divorce");
  assert.equal(detectFamilyPath("we need a prenup before the wedding"), "agreement");
  assert.equal(detectFamilyPath("postnuptial / partition and exchange"), "agreement");
  assert.equal(detectFamilyPath("motion to modify custody"), "modification");
  assert.equal(detectFamilyPath("he is behind on support and denied my visitation"), "enforcement");
  assert.equal(detectFamilyPath("custody and paternity, never married"), "custody");
  assert.equal(detectFamilyPath(""), "divorce"); // default
  assert.equal(detectFamilyPath(null), "divorce");
});

test("a fresh divorce starts with 'Decide your path' as current, rest upcoming", () => {
  const rm = buildFamilyRoadmap({ matterText: "divorce, two children" });
  assert.equal(rm.path, "divorce");
  assert.equal(rm.stages[0].status, "current");
  assert.ok(rm.stages.slice(1).every((s) => s.status === "upcoming"));
  // children stage present because kids detected
  assert.ok(rm.stages.some((s) => s.key === "children"));
});

test("a childless divorce omits the children stage", () => {
  const rm = buildFamilyRoadmap({ matterText: "divorce, no children, just property" });
  assert.ok(!rm.stages.some((s) => s.key === "children"));
  assert.ok(rm.stages.some((s) => s.key === "property"));
});

test("a filed petition marks decide+file done and advances current", () => {
  const rm = buildFamilyRoadmap({
    matterText: "divorce with kids",
    documents: [{ title: "Original Petition for Divorce", status: "delivered" }],
  });
  const byKey = Object.fromEntries(rm.stages.map((s) => [s.key, s.status]));
  assert.equal(byKey["decide"], "done");
  assert.equal(byKey["file"], "done");
  // first incomplete is temporary orders
  assert.equal(byKey["temporary"], "current");
});

test("a child-support fact marks the children stage done", () => {
  const rm = buildFamilyRoadmap({
    matterText: "divorce with kids",
    facts: ["Child support (Texas guideline estimate): about $1,000/month"],
  });
  const children = rm.stages.find((s) => s.key === "children")!;
  assert.equal(children.status, "done");
});

test("a signed final decree marks the final stage done", () => {
  const rm = buildFamilyRoadmap({
    matterText: "divorce",
    documents: [{ title: "Final Decree of Divorce", status: "approved" }],
  });
  const final = rm.stages.find((s) => s.key === "final")!;
  assert.equal(final.status, "done");
  // a draft (not approved) final decree should NOT count as done
  const rm2 = buildFamilyRoadmap({
    matterText: "divorce",
    documents: [{ title: "Final Decree of Divorce", status: "draft" }],
  });
  assert.notEqual(rm2.stages.find((s) => s.key === "final")!.status, "done");
});

test("family-violence signals raise the safety banner with a hotline", () => {
  const rm = buildFamilyRoadmap({ matterText: "divorce, there has been family violence and I'm afraid" });
  assert.equal(rm.safety, true);
  assert.ok(rm.safetyNote && /1-800-799-7233/.test(rm.safetyNote));
  const calm = buildFamilyRoadmap({ matterText: "amicable divorce, no children" });
  assert.equal(calm.safety, false);
  assert.equal(calm.safetyNote, undefined);
});

test("agreement path has draft/review/sign stages and never auto-completes review/sign", () => {
  const rm = buildFamilyRoadmap({
    matterText: "prenup",
    documents: [{ title: "Premarital Agreement", status: "approved" }],
  });
  assert.equal(rm.path, "agreement");
  const review = rm.stages.find((s) => s.key === "review")!;
  const sign = rm.stages.find((s) => s.key === "sign")!;
  // these depend on out-of-app human steps, so they never report 'done'
  assert.notEqual(review.status, "done");
  assert.notEqual(sign.status, "done");
});

test("every stage has a non-empty title and body; exactly one current unless all done", () => {
  for (const text of ["divorce kids", "prenup", "modify support", "enforce support", "custody unmarried"]) {
    const rm = buildFamilyRoadmap({ matterText: text });
    for (const s of rm.stages) {
      assert.ok(s.title.length > 0 && s.body.length > 0, `${text}/${s.key}`);
    }
    const currents = rm.stages.filter((s) => s.status === "current").length;
    assert.ok(currents <= 1, `${text} has ${currents} current stages`);
  }
});
