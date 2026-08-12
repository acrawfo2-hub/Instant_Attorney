import test from "node:test";
import assert from "node:assert/strict";
import { formattingGuidance, normalizeCheckTypes } from "./attorney-review-qa.ts";

test("normalizes independently selected checks and rejects unknown values", () => {
  assert.deepEqual(normalizeCheckTypes(["completeness", "bogus", "completeness", "authorities"]), [
    "completeness", "authorities",
  ]);
});

test("formatting registry distinguishes curated validation from fallback", () => {
  const curated = formattingGuidance("complaint", "Federal");
  assert.equal(curated.fallbackRequired, false);
  assert.match(curated.guidance, /Registry source/);

  const fallback = formattingGuidance("draft_contract", "Texas");
  assert.equal(fallback.fallbackRequired, true);
  assert.match(fallback.guidance, /official court source/);
});
