import { test } from "node:test";
import assert from "node:assert/strict";
import { LEGAL_FRESHNESS_ITEMS } from "./registry.ts";
import { parseISODate, scanFreshness } from "./scan.ts";

test("registry is non-empty and every entry has complete, valid provenance", () => {
  assert.ok(LEGAL_FRESHNESS_ITEMS.length >= 1);
  for (const it of LEGAL_FRESHNESS_ITEMS) {
    assert.ok(it.id && it.label && it.area && it.currentValue, `${it.id} core fields`);
    assert.ok(it.sourceUrl.startsWith("https://"), `${it.id} https source`);
    assert.ok(it.sourceUrl.includes(".gov"), `${it.id} cites a .gov source`);
    assert.ok(parseISODate(it.verifiedOn), `${it.id} verifiedOn is a valid date`);
    assert.ok(parseISODate(it.reviewAfter), `${it.id} reviewAfter is a valid date`);
    // reviewAfter must be on/after verifiedOn.
    assert.ok(it.reviewAfter >= it.verifiedOn, `${it.id} reviewAfter >= verifiedOn`);
    if (it.effectiveDate) assert.ok(parseISODate(it.effectiveDate), `${it.id} effectiveDate valid`);
    if (it.nextExpectedChange) assert.ok(parseISODate(it.nextExpectedChange), `${it.id} nextExpectedChange valid`);
  }
});

test("ids are unique", () => {
  const ids = LEGAL_FRESHNESS_ITEMS.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("nothing is overdue as of the day everything was verified", () => {
  // Scanning as of the latest verifiedOn date, no entry should already be overdue
  // — a guard against authoring a reviewAfter in the past.
  const latestVerified = LEGAL_FRESHNESS_ITEMS.map((i) => i.verifiedOn).sort().at(-1)!;
  const res = scanFreshness(LEGAL_FRESHNESS_ITEMS, latestVerified);
  assert.equal(res.overdue.length, 0, `overdue at authoring time: ${res.overdue.map((i) => i.id).join(", ")}`);
});

test("the child-support cap is tracked (the value that drifted before)", () => {
  const cap = LEGAL_FRESHNESS_ITEMS.find((i) => i.id === "tx-child-support-net-resources-cap");
  assert.ok(cap, "cap entry present");
  assert.equal(cap.volatility, "indexed-dollar");
  assert.ok(cap.nextExpectedChange, "cap carries its next scheduled change");
});
