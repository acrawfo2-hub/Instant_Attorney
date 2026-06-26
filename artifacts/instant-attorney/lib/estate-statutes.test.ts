import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTATE_STATUTES,
  getEstateStatute,
  isKnownEstateStatuteKey,
  estateStatutesForPrompt,
  matchEstateStatutesByText,
} from "./estate-statutes.ts";

const VALID_CATEGORIES = [
  "probate",
  "probate-avoidance",
  "incapacity",
  "trusts",
  "homestead",
  "intestacy",
  "tax",
];

test("registry is non-empty and every statute cites an official .gov source", () => {
  assert.ok(ESTATE_STATUTES.length >= 1);
  for (const s of ESTATE_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.official_url.includes(".gov"), `${s.key} should cite a .gov source`);
    assert.ok(s.code && s.topic && s.summary && s.client_right, `${s.key} core fields`);
    assert.ok(VALID_CATEGORIES.includes(s.category), `${s.key} category`);
    assert.ok(["Texas", "Federal"].includes(s.jurisdiction), `${s.key} jurisdiction`);
    assert.ok(s.triggers.length > 0, `${s.key} triggers`);
  }
});

test("statute keys are unique", () => {
  const keys = ESTATE_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("the middle-class demystifiers are present", () => {
  // Independent administration (cheap probate) and no Texas death tax are the
  // two facts the whole deep dive rests on.
  assert.ok(isKnownEstateStatuteKey("tx-independent-administration"));
  assert.ok(isKnownEstateStatuteKey("no-tx-estate-tax"));
  assert.ok(isKnownEstateStatuteKey("tx-transfer-on-death-deed"));
});

test("lookup + membership helpers", () => {
  assert.ok(isKnownEstateStatuteKey("tx-revocable-living-trust"));
  assert.ok(!isKnownEstateStatuteKey("nope"));
  assert.equal(getEstateStatute("nope"), undefined);
  assert.ok(getEstateStatute("tx-statutory-durable-poa")?.code.includes("752"));
});

test("prompt catalog lists every key", () => {
  const catalog = estateStatutesForPrompt();
  for (const s of ESTATE_STATUTES) assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
});

test("offline keyword fallback catches obvious estate situations", () => {
  assert.ok(matchEstateStatutesByText("do I need a trust?").map((s) => s.key).includes("tx-revocable-living-trust"));
  assert.ok(matchEstateStatutesByText("avoid probate on my house").map((s) => s.key).includes("tx-transfer-on-death-deed"));
  assert.ok(matchEstateStatutesByText("my relative died without a will").map((s) => s.key).includes("tx-intestate-succession"));
  assert.ok(matchEstateStatutesByText("who makes my medical decisions").map((s) => s.key).includes("tx-medical-power-of-attorney"));
});
