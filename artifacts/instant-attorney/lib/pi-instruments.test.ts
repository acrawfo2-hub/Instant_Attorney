import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PI_INSTRUMENTS,
  getPiInstrument,
  isKnownPiInstrumentKey,
  piInstrumentsForPrompt,
  piInstrumentFieldHint,
  matchPiInstrumentsByText,
  looksLikePersonalInjuryMatter,
} from "./pi-instruments.ts";
import { isKnownPiStatuteKey } from "./pi-statutes.ts";
import { WIZARD_LABELS } from "./types.ts";

test("registry is non-empty with complete core fields", () => {
  assert.ok(PI_INSTRUMENTS.length >= 1);
  for (const i of PI_INSTRUMENTS) {
    assert.ok(i.label && i.purpose && i.recipient_guidance, `${i.key} core fields`);
    assert.ok(i.required_fields.length > 0, `${i.key} required fields`);
    assert.ok(i.triggers.length > 0, `${i.key} triggers`);
  }
});

test("instrument keys are unique", () => {
  const keys = PI_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every instrument routes through a real wizard type", () => {
  for (const i of PI_INSTRUMENTS) assert.ok(i.wizard_type in WIZARD_LABELS, `${i.key} ${i.wizard_type}`);
});

test("every referenced statute key resolves", () => {
  for (const i of PI_INSTRUMENTS) {
    for (const key of i.relevant_statutes) {
      assert.ok(isKnownPiStatuteKey(key), `${i.key} references unknown statute ${key}`);
    }
  }
});

test("evidence preservation is flagged high_stakes", () => {
  assert.equal(getPiInstrument("evidence_preservation_letter")?.high_stakes, true);
});

test("lookup + prompt catalog + field hint", () => {
  assert.ok(isKnownPiInstrumentKey("insurer_settlement_demand"));
  const catalog = piInstrumentsForPrompt();
  for (const i of PI_INSTRUMENTS) assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  assert.ok(piInstrumentFieldHint("insurer_settlement_demand")?.includes("Required fields:"));
});

test("looksLikePersonalInjuryMatter catches terse subtypes and richer summaries", () => {
  for (const t of ["car accident", "slip and fall", "personal injury", "wrongful death", "medical malpractice"]) {
    assert.ok(looksLikePersonalInjuryMatter(t), `should detect ${t}`);
  }
  assert.ok(looksLikePersonalInjuryMatter("Client was rear-ended and injured."));
  assert.ok(!looksLikePersonalInjuryMatter("debt collector lawsuit"));
  assert.ok(!looksLikePersonalInjuryMatter("divorce with two kids"));
  assert.ok(!looksLikePersonalInjuryMatter(null));
});

test("offline keyword fallback maps situations to instruments", () => {
  assert.ok(matchPiInstrumentsByText("send a settlement demand to the insurer").map((i) => i.key).includes("insurer_settlement_demand"));
  assert.ok(matchPiInstrumentsByText("they want a recorded statement").map((i) => i.key).includes("recorded_statement_refusal"));
});
