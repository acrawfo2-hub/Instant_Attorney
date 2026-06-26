import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLienRoadmap } from "./lien-roadmap.ts";

test("mechanics lien path is detected and has notice stage", () => {
  const rm = buildLienRoadmap({ matterText: "contractor filed a mechanic's lien on my house" });
  assert.equal(rm.path, "mechanics_lien");
  assert.ok(rm.stages.some((s) => s.key === "notices"));
  assert.equal(rm.stages[0].status, "current");
});

test("mortgage foreclosure is urgent when sale is scheduled", () => {
  const rm = buildLienRoadmap({
    matterText: "behind on mortgage",
    facts: ["Notice of sale scheduled for first Tuesday next month."],
  });
  assert.equal(rm.path, "mortgage_foreclosure");
  assert.equal(rm.urgent, true);
  assert.ok(rm.urgentNote);
});

test("title encumbrance path", () => {
  const rm = buildLienRoadmap({ matterText: "title commitment has a schedule B exception" });
  assert.equal(rm.path, "title_encumbrance");
});

test("progress advances when response is filed", () => {
  const rm = buildLienRoadmap({
    matterText: "judgment lien on property",
    facts: ["Sent a written response to the creditor last week."],
    documents: [{ title: "Response to Lien", status: "approved" }],
  });
  const respond = rm.stages.find((s) => s.key === "respond");
  assert.ok(respond);
  assert.notEqual(respond!.status, "upcoming");
});

test("every stage has title and body", () => {
  const rm = buildLienRoadmap({ matterText: "lien on my house" });
  for (const s of rm.stages) {
    assert.ok(s.title.length > 0 && s.body.length > 0, s.key);
  }
});
