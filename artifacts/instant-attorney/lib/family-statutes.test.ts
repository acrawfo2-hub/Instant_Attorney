import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_STATUTES,
  getFamilyStatute,
  isKnownFamilyStatuteKey,
  familyStatutesForPrompt,
  matchFamilyStatutesByText,
} from "./family-statutes.ts";

const VALID_CHAPTERS = ["3", "4", "6", "7", "8", "85", "153", "154", "156", "157", "160"];

test("registry is non-empty and every statute cites an official .gov source", () => {
  assert.ok(FAMILY_STATUTES.length >= 1);
  for (const s of FAMILY_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.official_url.includes(".gov"), `${s.key} should cite a .gov source`);
    assert.ok(s.code && s.topic && s.summary && s.client_right, `${s.key} core fields`);
    assert.ok(VALID_CHAPTERS.includes(s.chapter), `${s.key} chapter`);
    assert.ok(s.triggers.length > 0, `${s.key} has triggers`);
  }
});

test("statute keys are unique", () => {
  const keys = FAMILY_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup + key membership helpers", () => {
  assert.ok(isKnownFamilyStatuteKey("tx-fam-support-guidelines"));
  assert.ok(!isKnownFamilyStatuteKey("totally-made-up"));
  assert.equal(
    getFamilyStatute("tx-fam-divorce-waiting")?.code,
    "Tex. Fam. Code § 6.702"
  );
  assert.equal(getFamilyStatute("nope"), undefined);
});

test("prompt catalog lists every key", () => {
  const catalog = familyStatutesForPrompt();
  for (const s of FAMILY_STATUTES) {
    assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
  }
});

test("offline keyword fallback catches obvious family situations", () => {
  const support = matchFamilyStatutesByText("how much child support will I pay").map((s) => s.key);
  assert.ok(support.includes("tx-fam-support-guidelines"));

  const custody = matchFamilyStatutesByText("we are fighting over custody and visitation").map((s) => s.key);
  assert.ok(custody.includes("tx-fam-spo") || custody.includes("tx-fam-best-interest"));

  const safety = matchFamilyStatutesByText("I am afraid, there has been family violence").map((s) => s.key);
  assert.ok(safety.includes("tx-fam-protective-order"));

  const prenup = matchFamilyStatutesByText("we want a prenup before the wedding").map((s) => s.key);
  assert.ok(prenup.includes("tx-fam-premarital-agreement"));
  assert.ok(!prenup.includes("tx-fam-marital-agreement"));

  const postnup = matchFamilyStatutesByText("we're already married and want a postnup / partition agreement").map((s) => s.key);
  assert.ok(postnup.includes("tx-fam-marital-agreement"));

  // "premarital agreement" must NOT trip the postnup statute (substring collision).
  const premaritalPhrase = matchFamilyStatutesByText("i want a premarital agreement").map((s) => s.key);
  assert.ok(premaritalPhrase.includes("tx-fam-premarital-agreement"));
  assert.ok(!premaritalPhrase.includes("tx-fam-marital-agreement"));
});
