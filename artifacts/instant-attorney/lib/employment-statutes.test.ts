import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYMENT_STATUTES,
  getEmploymentStatute,
  isKnownEmploymentStatuteKey,
  employmentStatutesForPrompt,
  matchEmploymentStatutesByText,
} from "./employment-statutes.ts";

const VALID = ["discrimination", "retaliation", "wage-hour", "leave", "at-will", "non-compete", "severance", "labor-relations", "notice"];

test("registry is non-empty and every statute cites an official .gov source", () => {
  assert.ok(EMPLOYMENT_STATUTES.length >= 1);
  for (const s of EMPLOYMENT_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.official_url.includes(".gov"), `${s.key} should cite a .gov source`);
    assert.ok(s.code && s.topic && s.summary && s.plain_point, `${s.key} core fields`);
    assert.ok(VALID.includes(s.category), `${s.key} category`);
    assert.ok(["Federal", "Texas"].includes(s.jurisdiction), `${s.key} jurisdiction`);
    assert.ok(s.triggers.length > 0, `${s.key} triggers`);
  }
});

test("statute keys are unique", () => {
  const keys = EMPLOYMENT_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("the deadline-critical and non-compete entries exist", () => {
  assert.ok(isKnownEmploymentStatuteKey("title-vii"));
  assert.ok(isKnownEmploymentStatuteKey("tchra"));
  assert.ok(isKnownEmploymentStatuteKey("tx-noncompete"));
  assert.ok(isKnownEmploymentStatuteKey("owbpa-severance"));
  assert.ok(!isKnownEmploymentStatuteKey("nope"));
  assert.match(getEmploymentStatute("title-vii")!.deadline ?? "", /300 days/);
});

test("prompt catalog lists every key", () => {
  const catalog = employmentStatutesForPrompt();
  for (const s of EMPLOYMENT_STATUTES) assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
});

test("offline keyword fallback catches obvious employment situations", () => {
  assert.ok(matchEmploymentStatutesByText("I was fired because of my pregnancy").map((s) => s.key).includes("title-vii"));
  assert.ok(matchEmploymentStatutesByText("they won't pay my overtime").map((s) => s.key).includes("flsa"));
  assert.ok(matchEmploymentStatutesByText("my non-compete says I can't work for a competitor").map((s) => s.key).includes("tx-noncompete"));
  assert.ok(matchEmploymentStatutesByText("fired after I filed a workers comp claim").map((s) => s.key).includes("workers-comp-retaliation"));
});
