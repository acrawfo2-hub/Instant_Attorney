import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAMATION_STATUTES,
  getDefamationStatute,
  isKnownDefamationStatuteKey,
  defamationStatutesForPrompt,
  matchDefamationStatutesByText,
} from "./defamation-statutes.ts";

const VALID = ["elements", "limitations", "mitigation", "anti-slapp", "platform-immunity", "constitutional", "defenses"];

test("registry is non-empty and every statute cites an official .gov source", () => {
  assert.ok(DEFAMATION_STATUTES.length >= 1);
  for (const s of DEFAMATION_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.official_url.includes(".gov"), `${s.key} should cite a .gov source`);
    assert.ok(s.code && s.topic && s.summary && s.plain_point, `${s.key} core fields`);
    assert.ok(VALID.includes(s.category), `${s.key} category`);
    assert.ok(["Federal", "Texas"].includes(s.jurisdiction), `${s.key} jurisdiction`);
    assert.ok(s.triggers.length > 0, `${s.key} triggers`);
  }
});

test("statute keys are unique", () => {
  const keys = DEFAMATION_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup + membership; the SOL and anti-SLAPP entries exist", () => {
  assert.ok(isKnownDefamationStatuteKey("tx-defamation-limitations"));
  assert.ok(isKnownDefamationStatuteKey("tx-tcpa-anti-slapp"));
  assert.ok(!isKnownDefamationStatuteKey("nope"));
  assert.equal(getDefamationStatute("tx-defamation-limitations")?.deadline, "Sue within one year of publication.");
});

test("prompt catalog lists every key", () => {
  const catalog = defamationStatutesForPrompt();
  for (const s of DEFAMATION_STATUTES) assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
});

test("offline keyword fallback catches obvious defamation situations", () => {
  assert.ok(matchDefamationStatutesByText("someone lied about me online").map((s) => s.key).includes("tx-libel-elements"));
  assert.ok(matchDefamationStatutesByText("should I sue over a bad online review").map((s) => s.key).includes("tx-tcpa-anti-slapp"));
  assert.ok(matchDefamationStatutesByText("the post is from an anonymous fake account").map((s) => s.key).includes("us-section-230"));
  assert.ok(matchDefamationStatutesByText("how long do I have, it was last year").map((s) => s.key).includes("tx-defamation-limitations"));
});
