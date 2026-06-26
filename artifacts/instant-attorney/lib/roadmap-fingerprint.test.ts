import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRoadmapFingerprint } from "./roadmap-fingerprint.ts";

const baseCase = {
  matter_type: "reactive",
  matter_subtype: "divorce",
  summary: "Uncontested divorce with two children",
  legal_strategy: { document_plan: ["decree"], recommended_wizards: ["general_document"] },
  financial_disclosure_acked_at: null,
  updated_at: "2026-01-01T00:00:00Z",
};

test("fingerprint is stable for identical input", () => {
  const input = {
    caseFile: baseCase,
    facts: [{ status: "confirmed", description: "Married 10 years", kind: "fact", updated_at: "" }],
    documents: [{ status: "draft", title: "Petition", updated_at: "" }],
    requestedAttachments: [],
    consultRequest: null,
    attachmentCount: 0,
  };
  const a = computeRoadmapFingerprint(input);
  const b = computeRoadmapFingerprint(input);
  assert.equal(a, b);
  assert.match(a, /^[a-f0-9]{64}$/);
});

test("fingerprint changes when a new fact is confirmed", () => {
  const base = {
    caseFile: baseCase,
    facts: [] as { status: string; description: string; kind: string; updated_at: string }[],
    documents: [],
    requestedAttachments: [],
    consultRequest: null,
    attachmentCount: 0,
  };
  const before = computeRoadmapFingerprint(base);
  const after = computeRoadmapFingerprint({
    ...base,
    facts: [{ status: "confirmed", description: "Filed petition last month", kind: "fact", updated_at: "" }],
  });
  assert.notEqual(before, after);
});
