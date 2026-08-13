import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEBT_INSTRUMENTS,
  getDebtInstrument,
  isKnownDebtInstrumentKey,
  debtInstrumentsForPrompt,
  debtInstrumentFieldHint,
  matchDebtInstrumentsByText,
  looksLikeDebtMatter,
} from "./debt-instruments.ts";
import { isKnownDebtStatuteKey } from "./debt-statutes.ts";
import { INSTRUMENT_LABELS } from "./types.ts";

test("registry is non-empty with complete core fields", () => {
  assert.ok(DEBT_INSTRUMENTS.length >= 1);
  for (const i of DEBT_INSTRUMENTS) {
    assert.ok(i.label && i.purpose && i.recipient_guidance, `${i.key} core fields`);
    assert.ok(i.required_fields.length > 0, `${i.key} required fields`);
    assert.ok(i.triggers.length > 0, `${i.key} triggers`);
  }
});

test("instrument keys are unique", () => {
  const keys = DEBT_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every instrument routes through a real instrument type (no new DocType/enum)", () => {
  for (const i of DEBT_INSTRUMENTS) assert.ok(i.engine in INSTRUMENT_LABELS, `${i.key} ${i.engine}`);
});

test("every referenced statute key resolves", () => {
  for (const i of DEBT_INSTRUMENTS) {
    for (const key of i.relevant_statutes) {
      assert.ok(isKnownDebtStatuteKey(key), `${i.key} references unknown statute ${key}`);
    }
  }
});

test("answering a lawsuit is flagged high_stakes", () => {
  assert.equal(getDebtInstrument("answer_to_debt_suit")?.high_stakes, true);
});

test("lookup + prompt catalog + field hint", () => {
  assert.ok(isKnownDebtInstrumentKey("debt_validation_request"));
  assert.ok(!isKnownDebtInstrumentKey("nope"));
  const catalog = debtInstrumentsForPrompt();
  for (const i of DEBT_INSTRUMENTS) assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  assert.ok(debtInstrumentFieldHint("debt_validation_request")?.includes("Required fields:"));
  assert.equal(debtInstrumentFieldHint("nope"), null);
});

test("offline keyword fallback maps situations to instruments", () => {
  assert.ok(matchDebtInstrumentsByText("I was served with a debt lawsuit").map((i) => i.key).includes("answer_to_debt_suit"));
  assert.ok(matchDebtInstrumentsByText("make them stop calling me").map((i) => i.key).includes("cease_communication_letter"));
});

test("looksLikeDebtMatter catches terse subtypes and richer summaries", () => {
  for (const t of ["debt", "collections", "credit card debt", "garnishment", "bankruptcy"]) {
    assert.ok(looksLikeDebtMatter(t), `should detect ${t}`);
  }
  assert.ok(looksLikeDebtMatter("Client is being sued by a debt collector."));
  assert.ok(!looksLikeDebtMatter("HOA violation notice dispute"));
  assert.ok(!looksLikeDebtMatter("divorce with two kids"));
  assert.ok(!looksLikeDebtMatter(null));
});
