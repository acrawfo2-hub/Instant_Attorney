import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRoadmapForCase, detectMatterFlags } from "./roadmap-build.ts";
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

test("detectMatterFlags prefers employment over PI for workplace injury text", () => {
  const flags = detectMatterFlags("I was injured at work and my employer retaliated.");
  assert.equal(flags.isEmploymentMatter, true);
  assert.equal(flags.isPiMatter, false);
});

test("placeholder gaps do not keep generic roadmap on build your file", () => {
  const r = resolveRoadmapForCase({
    caseFile: {
      ...baseFile,
      matter_subtype: "widget dispute",
      summary: "A contract over widgets",
      matter_type: "reactive",
    },
    facts: [
      { id: "f1", status: "confirmed", description: "Party A owes money", kind: "fact", created_at: "", updated_at: "" },
      { id: "g1", status: "gap", description: "Client Name", kind: "gap", created_at: "", updated_at: "" },
    ],
    documents: [
      {
        id: "d1",
        case_file_id: "cf-1",
        title: "Demand Letter",
        doc_type: "demand_letter",
        status: "draft",
        draft_text: "Dear [[Client Name]], please pay.",
        created_at: "",
        updated_at: "",
      },
    ],
    requestedAttachments: [],
    consultRequest: null,
  });
  assert.ok(r);
  assert.equal(r!.blueprintKey, "generic");
  const buildFile = r!.stages.find((s) => s.key === "build_file");
  assert.equal(buildFile?.status, "done");
});

test("client corrections apply to the default (generic) roadmap, not just authored ones", () => {
  const r = resolveRoadmapForCase({
    caseFile: { ...baseFile, matter_subtype: "widget dispute", summary: "A contract over widgets" },
    facts: [
      {
        id: "a1",
        status: "confirmed",
        description: "Roadmap · documents: Client confirmed this step is complete.",
        kind: "fact",
        created_at: "",
        updated_at: "",
      },
    ],
    documents: [],
    requestedAttachments: [],
    consultRequest: null,
  });
  assert.ok(r);
  assert.equal(r!.blueprintKey, "generic");
  // The client's "I've already done this" on a generic stage is honored: it and
  // every earlier stage are done, and "you are here" advances past it.
  assert.equal(r!.stages.find((s) => s.key === "documents")?.status, "done");
  assert.equal(r!.stages.find((s) => s.key === "understand")?.status, "done");
  assert.equal(r!.currentStageKey, "review");
});
