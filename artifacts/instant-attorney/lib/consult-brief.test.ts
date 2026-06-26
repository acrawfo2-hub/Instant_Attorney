import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildConsultBriefSnapshot,
  computeClientEngagement,
  parsePreConsultMemo,
} from "./consult-brief.ts";
import type { CaseFile, FactItem, RequestedAttachment } from "./types.ts";

const baseFile: CaseFile = {
  id: "file-1",
  user_id: "user-1",
  title: "Employment dispute",
  summary: "Client was terminated after reporting safety violations.",
  goals: ["Recover lost wages", "Hold employer accountable"],
  matter_type: "reactive",
  matter_subtype: "employment",
  status: "open",
  file_type: "standard",
  archive_at: null,
  pre_consult_memo: null,
  legal_strategy: {
    summary: "Strong retaliation indicators",
    instruments: ["Demand Letter"],
    strengths: ["Protected activity"],
    risks: ["At-will employment"],
    recommended_wizards: ["demand_letter"],
    recommend_consult: true,
  },
  attorney_assessment: null,
  next_action: "Upload termination letter",
  jurisdiction: "Texas",
  opened_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
  updated_at: new Date().toISOString(),
};

test("buildConsultBriefSnapshot composes goals, gaps, and engagement", () => {
  const facts: FactItem[] = [
    { id: "f1", case_file_id: "file-1", user_id: "u", description: "Terminated March 1", status: "confirmed", created_at: "" },
    { id: "g1", case_file_id: "file-1", user_id: "u", description: "Employer name", status: "gap", created_at: "" },
  ];
  const uploads: RequestedAttachment[] = [
    { id: "a1", case_file_id: "file-1", user_id: "u", description: "Termination letter", reason: null, status: "uploaded", fulfilled_by: null, source: "ai", created_at: "" },
    { id: "a2", case_file_id: "file-1", user_id: "u", description: "Pay stubs", reason: null, status: "requested", fulfilled_by: null, source: "ai", created_at: "" },
  ];

  const snap = buildConsultBriefSnapshot({
    caseFile: baseFile,
    facts,
    documents: [],
    requestedAttachments: uploads,
  });

  assert.equal(snap.goals.length, 2);
  assert.equal(snap.openGaps[0], "Employer name");
  assert.equal(snap.documents.uploaded, 1);
  assert.equal(snap.documents.missing.length, 1);
  assert.equal(snap.strategy.recommendConsult, true);
  assert.ok(snap.engagement.signals.some((s) => s.includes("Uploaded 1/2")));
});

test("computeClientEngagement marks low engagement with many pending uploads", () => {
  const uploads: RequestedAttachment[] = Array.from({ length: 4 }, (_, i) => ({
    id: `a${i}`,
    case_file_id: "file-1",
    user_id: "u",
    description: `Doc ${i}`,
    reason: null,
    status: "requested" as const,
    fulfilled_by: null,
    source: "ai" as const,
    created_at: "",
  }));

  const engagement = computeClientEngagement([], uploads, {
    ...baseFile,
    summary: null,
    goals: [],
  });

  assert.equal(engagement.level, "low");
});

test("parsePreConsultMemo splits structured sections", () => {
  const memo = `---PRE-CONSULT MEMO---
MATTER OVERVIEW:
Employment retaliation matter in Texas.

CLIENT PROFILE:
Mid-level manager, wants wages back.

CONSULT PRIORITIES:
1. Confirm termination date
---END MEMO---`;

  const sections = parsePreConsultMemo(memo);
  assert.equal(sections.length, 3);
  assert.equal(sections[0].title, "MATTER OVERVIEW");
  assert.match(sections[2].body, /Confirm termination/);
});
