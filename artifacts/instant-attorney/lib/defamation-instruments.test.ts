import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAMATION_INSTRUMENTS,
  getDefamationInstrument,
  isKnownDefamationInstrumentKey,
  defamationInstrumentsForPrompt,
  defamationInstrumentFieldHint,
  matchDefamationInstrumentsByText,
  looksLikeDefamationMatter,
} from "./defamation-instruments.ts";
import { isKnownDefamationStatuteKey } from "./defamation-statutes.ts";
import { INSTRUMENT_LABELS } from "./types.ts";

test("registry is non-empty with complete core fields", () => {
  assert.ok(DEFAMATION_INSTRUMENTS.length >= 1);
  for (const i of DEFAMATION_INSTRUMENTS) {
    assert.ok(i.label && i.purpose && i.recipient_guidance, `${i.key} core fields`);
    assert.ok(i.required_fields.length > 0, `${i.key} required fields`);
    assert.ok(i.triggers.length > 0, `${i.key} triggers`);
  }
});

test("instrument keys are unique", () => {
  const keys = DEFAMATION_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every instrument routes through a real instrument type (no new DocType/enum)", () => {
  for (const i of DEFAMATION_INSTRUMENTS) assert.ok(i.engine in INSTRUMENT_LABELS, `${i.key} ${i.engine}`);
});

test("every referenced statute key resolves", () => {
  for (const i of DEFAMATION_INSTRUMENTS) {
    for (const key of i.relevant_statutes) {
      assert.ok(isKnownDefamationStatuteKey(key), `${i.key} references unknown statute ${key}`);
    }
  }
});

test("filing suit is flagged high_stakes (anti-SLAPP risk)", () => {
  assert.equal(getDefamationInstrument("defamation_petition")?.high_stakes, true);
});

test("lookup + prompt catalog + field hint", () => {
  assert.ok(isKnownDefamationInstrumentKey("retraction_request"));
  assert.ok(!isKnownDefamationInstrumentKey("nope"));
  const catalog = defamationInstrumentsForPrompt();
  for (const i of DEFAMATION_INSTRUMENTS) assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  assert.ok(defamationInstrumentFieldHint("retraction_request")?.includes("Required fields:"));
  assert.equal(defamationInstrumentFieldHint("nope"), null);
});

test("offline keyword fallback maps situations to instruments", () => {
  assert.ok(matchDefamationInstrumentsByText("I want them to take it down / retraction").map((i) => i.key).includes("retraction_request"));
  assert.ok(matchDefamationInstrumentsByText("how do I report the post to facebook").map((i) => i.key).includes("platform_report_request"));
});

test("looksLikeDefamationMatter catches terse subtypes and richer summaries", () => {
  for (const t of ["defamation", "libel", "slander", "fake review", "smear"]) {
    assert.ok(looksLikeDefamationMatter(t), `should detect ${t}`);
  }
  assert.ok(looksLikeDefamationMatter("A competitor spread false statements about my business."));
  assert.ok(!looksLikeDefamationMatter("divorce with two kids"));
  assert.ok(!looksLikeDefamationMatter("HOA violation notice"));
  assert.ok(!looksLikeDefamationMatter(null));
});
