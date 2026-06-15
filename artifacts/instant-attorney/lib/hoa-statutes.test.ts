import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOA_STATUTES,
  getHoaStatute,
  isKnownHoaStatuteKey,
  hoaStatutesForPrompt,
  matchHoaStatutesByText,
} from "./hoa-statutes.ts";

test("registry is non-empty and every statute cites an official .gov source", () => {
  assert.ok(HOA_STATUTES.length >= 1);
  for (const s of HOA_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.official_url.includes(".gov"), `${s.key} should cite a .gov source`);
    assert.ok(s.code && s.topic && s.summary && s.homeowner_right, `${s.key} core fields`);
    assert.ok(["209", "202"].includes(s.chapter), `${s.key} chapter`);
    assert.ok(s.triggers.length > 0, `${s.key} has triggers`);
  }
});

test("statute keys are unique", () => {
  const keys = HOA_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup + key membership helpers", () => {
  assert.ok(isKnownHoaStatuteKey("tx-209-records"));
  assert.ok(!isKnownHoaStatuteKey("totally-made-up"));
  assert.equal(getHoaStatute("tx-209-records")?.code, "Tex. Prop. Code § 209.005");
  assert.equal(getHoaStatute("nope"), undefined);
});

test("prompt catalog lists every key", () => {
  const catalog = hoaStatutesForPrompt();
  for (const s of HOA_STATUTES) {
    assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
  }
});

test("offline keyword fallback catches obvious HOA situations", () => {
  const fine = matchHoaStatutesByText("The HOA sent me a violation notice and a fine").map((s) => s.key);
  assert.ok(fine.includes("tx-209-notice-hearing"));

  const solar = matchHoaStatutesByText("they denied my solar panels").map((s) => s.key);
  assert.ok(solar.includes("tx-202-solar"));

  const foreclose = matchHoaStatutesByText("the association threatened to foreclose over fines").map((s) => s.key);
  assert.ok(foreclose.includes("tx-209-no-foreclose-fines"));
});
