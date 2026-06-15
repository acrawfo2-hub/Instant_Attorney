import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGovernmentFormsBlock } from "./file-parser.ts";

test("parses a GOVERNMENT FORMS block, keeping only known keys", () => {
  const raw = [
    "Some assistant reply...",
    "---GOVERNMENT FORMS---",
    "• dmv-address-change-tx — You moved to Texas; update your license within 30 days.",
    "• irs-w4 — New job means a fresh withholding certificate.",
    "• made-up-form — should be ignored",
    "---END FORMS---",
  ].join("\n");

  const parsed = parseGovernmentFormsBlock(raw);
  const keys = parsed.map((p) => p.form_key);
  assert.deepEqual(keys, ["dmv-address-change-tx", "irs-w4"]);
  assert.match(parsed[0].reason ?? "", /30 days/);
});

test("returns nothing when no block is present", () => {
  assert.deepEqual(parseGovernmentFormsBlock("just a normal reply"), []);
});

test("deduplicates repeated keys within a block", () => {
  const raw = [
    "---GOVERNMENT FORMS---",
    "• irs-w4 — first",
    "• irs-w4 — duplicate",
    "---END FORMS---",
  ].join("\n");
  assert.equal(parseGovernmentFormsBlock(raw).length, 1);
});
