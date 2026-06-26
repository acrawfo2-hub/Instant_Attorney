import { test } from "node:test";
import assert from "node:assert/strict";
import { parseGovernmentFormsBlock, parseDynamicFormCandidates } from "./file-parser.ts";

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

test("new: lines are parsed as dynamic candidates, not registry keys", () => {
  const raw = [
    "---GOVERNMENT FORMS---",
    "• irs-w4 — registry form",
    "• new: CA DMV Change of Address | California DMV | California | https://www.dmv.ca.gov/portal/ — you moved to CA",
    "• new: Some Local Permit | City Clerk | Austin, TX | unknown — local rule",
    "---END FORMS---",
  ].join("\n");

  // Seeded parser ignores the new: lines.
  assert.deepEqual(parseGovernmentFormsBlock(raw).map((p) => p.form_key), ["irs-w4"]);

  const dyn = parseDynamicFormCandidates(raw);
  assert.equal(dyn.length, 2);
  assert.equal(dyn[0].name, "CA DMV Change of Address");
  assert.equal(dyn[0].agency, "California DMV");
  assert.equal(dyn[0].official_url, "https://www.dmv.ca.gov/portal/");
  assert.match(dyn[0].reason ?? "", /moved to CA/);
  // "unknown" url becomes undefined.
  assert.equal(dyn[1].official_url, undefined);
});

test("dynamic candidates dedupe by slug", () => {
  const raw = [
    "---GOVERNMENT FORMS---",
    "• new: CA DMV Change of Address | DMV | CA | unknown — a",
    "• new: ca dmv change of address | DMV | CA | unknown — b",
    "---END FORMS---",
  ].join("\n");
  assert.equal(parseDynamicFormCandidates(raw).length, 1);
});
