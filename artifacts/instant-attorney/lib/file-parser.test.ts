import { test } from "node:test";
import assert from "node:assert/strict";
import { extractDraftText } from "./file-parser.ts";

// Regression: a truncated draft (model hit its token limit before emitting the
// closing ---END DRAFT--- marker) must still be extracted so it can be saved.

test("extractDraftText returns text from a well-formed draft block", () => {
  const raw = "intro\n---DRAFT READY---\nHello world\n---END DRAFT---\ntrailing";
  assert.equal(extractDraftText(raw), "Hello world");
});

test("extractDraftText recovers a truncated draft with no closing marker", () => {
  const raw = "---DRAFT READY---\nDEMAND LETTER\n\nThis firm represents the client and demands payment of $[[AMOUNT]] within";
  const out = extractDraftText(raw);
  assert.ok(out, "truncated draft should still be extracted");
  assert.ok(out!.includes("DEMAND LETTER"));
  assert.ok(!out!.includes("---DRAFT READY---"));
});

test("extractDraftText stops at the next block marker when one follows", () => {
  const raw = "---DRAFT READY---\nThe body of the draft.\n---MISSING FACTS---\nBLOCKING:\n- the amount";
  const out = extractDraftText(raw);
  assert.equal(out, "The body of the draft.");
});

test("extractDraftText returns null when no draft block is present", () => {
  assert.equal(extractDraftText("just some chatter, no markers"), null);
});

test("extractDraftText returns null for an empty draft body", () => {
  assert.equal(extractDraftText("---DRAFT READY---\n   \n---MISSING FACTS---\nBLOCKING:"), null);
});

// ── Document plan parsing + stable keys ──────────────────────────────────────
import { parseDocumentPlan } from "./file-parser.ts";

const PLAN_BLOCK = [
  "SUMMARY: x",
  "DOCUMENT PLAN:",
  "1. LLC Operating Agreement | draft_contract | members need it before funding",
  "2. Promissory Note | general_document | documents the loan",
  "3. Cease & Desist | general_document |",
  "RECOMMEND_CONSULT: false",
].join("\n");

test("parseDocumentPlan parses titles, engines, and rationale in order", () => {
  const plan = parseDocumentPlan(PLAN_BLOCK);
  assert.equal(plan.length, 3);
  assert.equal(plan[0].title, "LLC Operating Agreement");
  assert.equal(plan[0].engine, "draft_contract");
  assert.equal(plan[0].rationale, "members need it before funding");
  // Two distinct general_document instruments stay separate (distinct keys).
  assert.equal(plan[1].engine, "general_document");
  assert.equal(plan[2].engine, "general_document");
  assert.notEqual(plan[1].key, plan[2].key);
});

test("parseDocumentPlan defaults an unknown engine to general_document", () => {
  const plan = parseDocumentPlan("DOCUMENT PLAN:\n1. Weird Thing | not_a_real_engine | why");
  assert.equal(plan[0].engine, "general_document");
});

test("parseDocumentPlan reuses a prior key for the same title (stable identity)", () => {
  const first = parseDocumentPlan(PLAN_BLOCK);
  const opKey = first[0].key;
  // Regenerated plan with the same title (different order/rationale) keeps the key.
  const regen = parseDocumentPlan(
    "DOCUMENT PLAN:\n1. LLC Operating Agreement | draft_contract | reworded rationale",
    first,
  );
  assert.equal(regen[0].key, opKey, "same title must keep its key so progress isn't lost");
});

test("parseDocumentPlan returns [] when there is no DOCUMENT PLAN section", () => {
  assert.deepEqual(parseDocumentPlan("SUMMARY: x\nRECOMMEND_CONSULT: true"), []);
});
