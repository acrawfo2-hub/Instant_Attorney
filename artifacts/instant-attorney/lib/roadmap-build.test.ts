import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoadmapForCase } from "./roadmap-build.ts";
import type { CaseFile } from "./types.ts";

const baseFile: CaseFile = {
  id: "cf-1",
  user_id: "u-1",
  matter_type: "reactive",
  matter_subtype: "divorce",
  summary: "Uncontested divorce",
  status: "active",
  file_type: "standard",
  legal_strategy: null,
  created_at: "",
  updated_at: "",
};

test("resolveRoadmapForCase returns family blueprint for divorce matter", () => {
  const r = resolveRoadmapForCase({
    caseFile: baseFile,
    facts: [],
    documents: [],
    requestedAttachments: [],
    consultRequest: null,
  });
  assert.ok(r);
  assert.match(r!.blueprintKey, /^family-/);
  assert.ok(r!.stages.length >= 3);
  assert.ok(r!.currentStageKey);
});

test("resolveRoadmapForCase returns generic for unknown matter", () => {
  const r = resolveRoadmapForCase({
    caseFile: { ...baseFile, matter_subtype: "widget dispute", summary: "A contract over widgets" },
    facts: [],
    documents: [],
    requestedAttachments: [],
    consultRequest: null,
  });
  assert.ok(r);
  assert.equal(r!.blueprintKey, "generic");
});
