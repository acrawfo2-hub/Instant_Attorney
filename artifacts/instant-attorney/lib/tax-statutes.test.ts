import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAX_STATUTES,
  getTaxStatute,
  isKnownTaxStatuteKey,
  taxStatutesForPrompt,
  matchTaxStatutesByText,
} from "./tax-statutes.ts";

const VALID = ["notices", "collection", "audit", "relief", "penalties", "identity"];

test("registry is non-empty and every statute cites an official .gov source", () => {
  assert.ok(TAX_STATUTES.length >= 1);
  for (const s of TAX_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.official_url.includes(".gov"), `${s.key} should cite a .gov source`);
    assert.ok(s.code && s.topic && s.summary && s.taxpayer_right, `${s.key} core fields`);
    assert.ok(VALID.includes(s.category), `${s.key} category`);
    assert.equal(s.jurisdiction, "Federal", `${s.key} jurisdiction`);
    assert.ok(s.triggers.length > 0, `${s.key} triggers`);
  }
});

test("statute keys are unique", () => {
  const keys = TAX_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup + membership helpers", () => {
  assert.ok(isKnownTaxStatuteKey("irs-cdp-rights"));
  assert.ok(!isKnownTaxStatuteKey("nope"));
  assert.equal(getTaxStatute("irc-innocent-spouse")?.code, "26 U.S.C. § 6015");
  const catalog = taxStatutesForPrompt();
  for (const s of TAX_STATUTES) assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
});

test("offline keyword fallback surfaces relevant statutes", () => {
  assert.ok(matchTaxStatutesByText("I got a CP2000 notice").map((s) => s.key).includes("irs-notice-response"));
  assert.ok(matchTaxStatutesByText("final notice of intent to levy").map((s) => s.key).includes("irs-cdp-rights"));
});
