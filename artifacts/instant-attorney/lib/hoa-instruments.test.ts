import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HOA_INSTRUMENTS,
  getHoaInstrument,
  isKnownHoaInstrumentKey,
  hoaInstrumentsForPrompt,
  hoaInstrumentFieldHint,
  matchHoaInstrumentsByText,
} from "./hoa-instruments.ts";
import { isKnownHoaStatuteKey } from "./hoa-statutes.ts";
import { WIZARD_LABELS } from "./types.ts";

test("registry is non-empty with complete core fields", () => {
  assert.ok(HOA_INSTRUMENTS.length >= 1);
  for (const i of HOA_INSTRUMENTS) {
    assert.ok(i.label && i.purpose && i.recipient_guidance, `${i.key} core fields`);
    assert.ok(i.required_fields.length > 0, `${i.key} has required fields`);
    assert.ok(i.triggers.length > 0, `${i.key} has triggers`);
  }
});

test("instrument keys are unique", () => {
  const keys = HOA_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every instrument routes through a real wizard type", () => {
  for (const i of HOA_INSTRUMENTS) {
    assert.ok(i.wizard_type in WIZARD_LABELS, `${i.key} wizard_type ${i.wizard_type}`);
  }
});

test("every referenced statute key resolves to a real statute", () => {
  for (const i of HOA_INSTRUMENTS) {
    for (const key of i.relevant_statutes) {
      assert.ok(isKnownHoaStatuteKey(key), `${i.key} references unknown statute ${key}`);
    }
  }
});

test("lookup + key membership helpers", () => {
  assert.ok(isKnownHoaInstrumentKey("records_request"));
  assert.ok(!isKnownHoaInstrumentKey("totally-made-up"));
  assert.equal(getHoaInstrument("records_request")?.default_response_days, 10);
  assert.equal(getHoaInstrument("nope"), undefined);
});

test("prompt catalog lists every key; field hint resolves", () => {
  const catalog = hoaInstrumentsForPrompt();
  for (const i of HOA_INSTRUMENTS) {
    assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  }
  const hint = hoaInstrumentFieldHint("records_request");
  assert.ok(hint && hint.includes("Required fields:"));
  assert.equal(hoaInstrumentFieldHint("nope"), null);
});

test("offline keyword fallback maps situations to instruments", () => {
  const records = matchHoaInstrumentsByText("I want to see the financials and meeting minutes").map((i) => i.key);
  assert.ok(records.includes("records_request"));

  const foreclose = matchHoaInstrumentsByText("they sent a notice of sale / foreclosure notice").map((i) => i.key);
  assert.ok(foreclose.includes("lien_foreclosure_response"));
});
