import assert from "node:assert/strict";
import test from "node:test";
import { getDocumentGenerationSpec } from "./document-generation-spec.ts";
import { RefinementScheduler, affectedSections, rankUnresolvedFactKeys, refineAndCheckDocument, requiresDraftingModel, substituteFactPlaceholders } from "./document-refinement.ts";

test("invalidates only dependent sections and coalesces by draft", () => {
  let now = new Date("2026-01-01T00:00:00Z");
  const scheduler = new RefinementScheduler(2_000, () => now);
  const drafts = [{ id: "d1", priority: 3, sections: [
    { id: "heading", text: "{{client.name}}", factKeys: ["client.name"], kind: "identity" as const },
    { id: "analysis", text: "Analysis", factKeys: ["jurisdiction"], kind: "analysis" as const },
  ] }];
  scheduler.schedule(["client.name"], drafts);
  scheduler.schedule(["jurisdiction"], drafts);
  assert.equal(scheduler.takeDue().length, 0);
  now = new Date("2026-01-01T00:00:03Z");
  const jobs = scheduler.takeDue();
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0].affectedSectionIds, ["heading", "analysis"]);
  assert.equal(requiresDraftingModel(affectedSections(drafts[0].sections, ["client.name"])), false);
  assert.equal(requiresDraftingModel(affectedSections(drafts[0].sections, ["jurisdiction"])), true);
});

test("deterministically substitutes known placeholders", () => {
  assert.equal(substituteFactPlaceholders("Dear {{client.name}} in {{jurisdiction}}", { "client.name": "Ada" }), "Dear Ada in {{jurisdiction}}");
});

test("ranks shared required facts above optional facts", () => {
  const demand = getDocumentGenerationSpec("demand_letter");
  const complaint = getDocumentGenerationSpec("complaint_letter");
  const ranked = rankUnresolvedFactKeys([
    { id: "lead", priority: 4, spec: demand },
    { id: "next", priority: 2, spec: complaint },
  ], []);
  assert.ok(["client.address", "client.name", "counterparty.name", "jurisdiction"].includes(ranked[0].key));
  assert.equal(ranked[0].draftCount, 2);
});

test("runs an independent whole-document check before ready", async () => {
  let criticArgs: { livingFile: string; sourceFacts: string } | undefined;
  const result = await refineAndCheckDocument({
    sections: [{ id: "heading", text: "Dear {{client.name}}", factKeys: ["client.name"], kind: "identity" }],
    changedFactKeys: ["client.name"],
    factValues: { "client.name": "Ada" },
    livingFile: "living-file-snapshot",
    sourceFacts: "source-fact-snapshot",
  }, {
    redraftSections: async () => { throw new Error("model should not be called"); },
    checkConsistency: async (args) => {
      criticArgs = args;
      return { status: "pass" };
    },
  });
  assert.equal(result.renderedText, "Dear Ada");
  assert.equal(result.status, "ready");
  assert.equal(criticArgs?.livingFile, "living-file-snapshot");
  assert.equal(criticArgs?.sourceFacts, "source-fact-snapshot");
});
