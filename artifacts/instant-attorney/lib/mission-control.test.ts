import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMissionControl } from "./mission-control.ts";
import type { CaseFile, Document, FactItem, RequestedAttachment } from "./types.ts";

const baseFile: CaseFile = {
  id: "file-1",
  user_id: "user-1",
  title: null,
  summary: "Test case",
  goals: [],
  matter_type: "reactive",
  matter_subtype: "employment",
  status: "open",
  file_type: "standard",
  archive_at: null,
  pre_consult_memo: null,
  legal_strategy: {
    summary: "Strategy",
    instruments: ["Demand Letter"],
    strengths: [],
    risks: [],
    recommended_wizards: ["demand_letter"],
  },
  attorney_assessment: null,
  next_action: null,
  jurisdiction: null,
  opened_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

function pendingDoc(): Document {
  return {
    id: "d1",
    case_file_id: "file-1",
    user_id: "u",
    parent_document_id: null,
    doc_type: "demand_letter",
    title: "Demand",
    status: "pending_review",
    content_json: {},
    draft_text: "Draft body",
    file_path: null,
    submitted_at: new Date().toISOString(),
    review_status: null,
    created_at: "",
    updated_at: "",
  };
}

test("puts create document in hero when strategy exists and no doc yet", () => {
  const board = computeMissionControl({
    caseFile: baseFile,
    documents: [],
    facts: [{ id: "f1", case_file_id: "file-1", user_id: "u", description: "x", status: "confirmed", created_at: "" }],
  });
  assert.equal(board.hero.activeStep, 2);
  // The hero used to open the wizard. Drafting is a conversation now, and the
  // drafting engine sits behind it — so the hero names the document and hands
  // the request to the case chat.
  const href = board.hero.cta?.href ?? "";
  assert.match(href, /^\/chat\?/);
  assert.match(href, /caseFileId=file-1/);
  assert.match(href, /Demand\+Letter/);
});

test("surfaces fact gaps in the action queue", () => {
  const gaps: FactItem[] = [
    { id: "g1", case_file_id: "file-1", user_id: "u", description: "Employer name", status: "gap", created_at: "" },
  ];
  const board = computeMissionControl({
    caseFile: baseFile,
    documents: [],
    facts: gaps,
  });
  assert.ok(board.actions.some((a) => a.kind === "gap" && a.factId === "g1"));
});

test("uses while-you-wait framing when doc is pending review", () => {
  const board = computeMissionControl({ caseFile: baseFile, documents: [pendingDoc()], facts: [] });
  assert.equal(board.hero.tone, "waiting");
  assert.equal(board.hero.eyebrow, "While you wait");
});

test("includes pending uploads for clients", () => {
  const uploads: RequestedAttachment[] = [{
    id: "a1",
    case_file_id: "file-1",
    user_id: "u",
    description: "Signed contract",
    reason: "Needed for draft",
    status: "requested",
    fulfilled_by: null,
    source: "ai",
    created_at: "",
  }];
  const board = computeMissionControl({
    caseFile: baseFile,
    documents: [],
    facts: [],
    requestedAttachments: uploads,
  });
  assert.ok(board.actions.some((a) => a.kind === "upload"));
});

test("shows attorney review link when doc pending", () => {
  const board = computeMissionControl({
    caseFile: baseFile,
    documents: [pendingDoc()],
    facts: [],
    mode: "attorney",
  });
  assert.match(board.actions[0]?.cta?.href ?? "", /\/attorney\/review\/d1/);
});

test("surfaces post-consult client actions at top priority", () => {
  const board = computeMissionControl({
    caseFile: baseFile,
    documents: [],
    facts: [],
    consultClientActions: [
      { id: "c1", text: "Upload photos of damage", kind: "document" },
      { id: "c2", text: "Schedule follow-up with HR", kind: "general" },
    ],
  });
  const consultActions = board.actions.filter((a) => a.id.startsWith("consult-action:"));
  assert.equal(consultActions.length, 2);
  assert.equal(consultActions[0].priority, 3);
  assert.equal(consultActions[0].kind, "upload");
});

test("existing counsel intake incomplete surfaces mission action", () => {
  const board = computeMissionControl({
    caseFile: { ...baseFile, counsel_intake_at: null },
    documents: [],
    facts: [],
  });
  assert.ok(board.actions.some((a) => a.id === "counsel:intake"));
});

test("document review goal with existing counsel suggests doc review wizard", () => {
  const board = computeMissionControl({
    caseFile: {
      ...baseFile,
      counsel_intake_at: new Date().toISOString(),
      has_existing_counsel: true,
      counsel_engagement_goal: "document_review",
    },
    documents: [],
    facts: [],
  });
  assert.ok(board.actions.some((a) => a.id === "counsel:doc-review"));
});
