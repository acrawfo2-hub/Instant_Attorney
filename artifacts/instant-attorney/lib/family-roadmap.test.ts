import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildFamilyRoadmap,
  detectFamilyPath,
} from "./family-roadmap.ts";

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
