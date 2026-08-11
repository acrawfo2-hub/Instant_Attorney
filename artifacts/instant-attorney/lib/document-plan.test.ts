import { test } from "node:test";
import assert from "node:assert/strict";
import { documentJobIdempotencyKey, parseDocumentPlan } from "./document-plan.ts";

test("parses a bounded structured document plan", () => {
  const plan = parseDocumentPlan('before\n---DOCUMENT PLAN---\n{"revision":2,"inputFactRevision":9,"documents":[{"identity":"demand-letter","documentType":"demand_letter","title":"Demand Letter","priority":80}]}\n---END DOCUMENT PLAN---');
  assert.equal(plan?.documents.length, 1);
  assert.equal(plan?.documents[0].documentType, "demand_letter");
});

test("rejects plans with more than three documents or unsafe fields", () => {
  const docs = Array.from({ length: 4 }, (_, i) => ({ identity: `doc-${i}`, documentType: "letter", title: "Letter" }));
  assert.equal(parseDocumentPlan(`---DOCUMENT PLAN---\n${JSON.stringify({ revision: 1, inputFactRevision: 1, documents: docs })}\n---END DOCUMENT PLAN---`), null);
  assert.equal(parseDocumentPlan('---DOCUMENT PLAN---\n{"revision":1,"inputFactRevision":0,"documents":[{"identity":"BAD VALUE","documentType":"letter","title":"x"}]}\n---END DOCUMENT PLAN---'), null);
});

test("idempotency keys are stable and scope identity by case and revision", () => {
  const key = documentJobIdempotencyKey("case-a", "demand-letter", 2);
  assert.equal(key, documentJobIdempotencyKey("case-a", "demand-letter", 2));
  assert.notEqual(key, documentJobIdempotencyKey("case-a", "demand-letter", 3));
  assert.notEqual(key, documentJobIdempotencyKey("case-b", "demand-letter", 2));
});
