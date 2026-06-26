import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PI_STATUTES,
  getPiStatute,
  isKnownPiStatuteKey,
  piStatutesForPrompt,
  matchPiStatutesByText,
} from "./pi-statutes.ts";

const VALID = ["limitations", "negligence", "damages", "insurance", "med-mal", "wrongful-death", "evidence"];

test("registry is non-empty and every statute cites an official .gov source", () => {
  assert.ok(PI_STATUTES.length >= 1);
  for (const s of PI_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.official_url.includes(".gov"), `${s.key} should cite a .gov source`);
    assert.ok(s.code && s.topic && s.summary && s.claimant_right, `${s.key} core fields`);
    assert.ok(VALID.includes(s.category), `${s.key} category`);
    assert.ok(["Federal", "Texas"].includes(s.jurisdiction), `${s.key} jurisdiction`);
    assert.ok(s.triggers.length > 0, `${s.key} triggers`);
  }
});

test("statute keys are unique", () => {
  const keys = PI_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup + membership helpers", () => {
  assert.ok(isKnownPiStatuteKey("tx-pi-sol-general"));
  assert.ok(!isKnownPiStatuteKey("nope"));
  assert.equal(getPiStatute("tx-pi-comparative-negligence")?.code, "Tex. Civ. Prac. & Rem. Code § 33.001");
});

test("prompt catalog lists every key", () => {
  const catalog = piStatutesForPrompt();
  for (const s of PI_STATUTES) assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
});

test("offline keyword fallback catches obvious PI situations", () => {
  assert.ok(matchPiStatutesByText("how long do I have to sue").map((s) => s.key).includes("tx-pi-sol-general"));
  assert.ok(matchPiStatutesByText("they say I was partially at fault").map((s) => s.key).includes("tx-pi-comparative-negligence"));
  assert.ok(matchPiStatutesByText("doctor surgical error malpractice").map((s) => s.key).includes("tx-med-mal-sol"));
});
