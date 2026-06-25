import { test } from "node:test";
import assert from "node:assert/strict";
import { buildBankruptcyRoadmap } from "./bankruptcy-roadmap.ts";

test("a fresh matter starts at credit counseling, rest upcoming", () => {
  const rm = buildBankruptcyRoadmap({ matterText: "thinking about bankruptcy" });
  assert.equal(rm.stages[0].key, "counseling");
  assert.equal(rm.stages[0].status, "current");
  assert.ok(rm.stages.slice(1).every((s) => s.status === "upcoming"));
});

test("means-test + exemption facts complete the 'gather your picture' stage", () => {
  const rm = buildBankruptcyRoadmap({
    matterText: "bankruptcy",
    facts: [
      "Chapter 7 means test (median-income screen): below the Texas median",
      "Texas exemptions (what you'd keep): would likely keep everything listed",
    ],
  });
  const picture = rm.stages.find((s) => s.key === "picture")!;
  assert.equal(picture.status, "done");
});

test("a filed petition advances past filing; 341/education/discharge still ahead", () => {
  const rm = buildBankruptcyRoadmap({
    matterText: "bankruptcy",
    documents: [{ title: "Voluntary Petition", status: "delivered" }],
  });
  const byKey = Object.fromEntries(rm.stages.map((s) => [s.key, s.status]));
  assert.equal(byKey["file"], "done");
  assert.equal(byKey["meeting"], "current");
  assert.equal(byKey["discharge"], "upcoming");
});

test("a discharge marks the whole path done", () => {
  const rm = buildBankruptcyRoadmap({ matterText: "bankruptcy discharge granted, case closed" });
  assert.ok(rm.stages.every((s) => s.status === "done"));
});

test("a draft (not approved) petition does not count as filed", () => {
  const rm = buildBankruptcyRoadmap({
    matterText: "bankruptcy",
    documents: [{ title: "Voluntary Petition", status: "draft" }],
  });
  assert.notEqual(rm.stages.find((s) => s.key === "file")!.status, "done");
});

test("every stage has a title and body; at most one current", () => {
  const rm = buildBankruptcyRoadmap({ matterText: "bankruptcy" });
  for (const s of rm.stages) assert.ok(s.title.length > 0 && s.body.length > 0, s.key);
  assert.ok(rm.stages.filter((s) => s.status === "current").length <= 1);
});
