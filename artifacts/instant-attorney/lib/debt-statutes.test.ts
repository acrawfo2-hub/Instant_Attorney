import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEBT_STATUTES,
  getDebtStatute,
  isKnownDebtStatuteKey,
  debtStatutesForPrompt,
  matchDebtStatutesByText,
} from "./debt-statutes.ts";

const VALID = ["fdcpa", "fcra", "tx-debt-collection", "tx-exemptions", "limitations", "bankruptcy"];

test("registry is non-empty and every statute cites an official .gov source", () => {
  assert.ok(DEBT_STATUTES.length >= 1);
  for (const s of DEBT_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.official_url.includes(".gov"), `${s.key} should cite a .gov source`);
    assert.ok(s.code && s.topic && s.summary && s.consumer_right, `${s.key} core fields`);
    assert.ok(VALID.includes(s.category), `${s.key} category`);
    assert.ok(["Federal", "Texas"].includes(s.jurisdiction), `${s.key} jurisdiction`);
    assert.ok(s.triggers.length > 0, `${s.key} triggers`);
  }
});

test("statute keys are unique", () => {
  const keys = DEBT_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup + membership helpers", () => {
  assert.ok(isKnownDebtStatuteKey("fdcpa-validation"));
  assert.ok(!isKnownDebtStatuteKey("nope"));
  assert.equal(getDebtStatute("tx-limitations-debt")?.code, "Tex. Civ. Prac. & Rem. Code § 16.004");
  assert.equal(getDebtStatute("nope"), undefined);
});

test("prompt catalog lists every key", () => {
  const catalog = debtStatutesForPrompt();
  for (const s of DEBT_STATUTES) assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
});

test("offline keyword fallback catches obvious debt situations", () => {
  assert.ok(matchDebtStatutesByText("a debt collector contacted me").map((s) => s.key).includes("fdcpa-validation"));
  assert.ok(matchDebtStatutesByText("can they garnish my wages?").map((s) => s.key).includes("tx-wage-exemption"));
  assert.ok(matchDebtStatutesByText("this is really old debt, time barred").map((s) => s.key).includes("tx-limitations-debt"));
  assert.ok(matchDebtStatutesByText("filing bankruptcy to stop foreclosure").map((s) => s.key).includes("bankruptcy-automatic-stay"));
});
