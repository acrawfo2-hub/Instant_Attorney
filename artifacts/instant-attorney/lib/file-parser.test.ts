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
