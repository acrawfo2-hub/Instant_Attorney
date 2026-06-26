import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAX_INSTRUMENTS,
  getTaxInstrument,
  isKnownTaxInstrumentKey,
  taxInstrumentsForPrompt,
  taxInstrumentFieldHint,
  matchTaxInstrumentsByText,
  looksLikeTaxMatter,
} from "./tax-instruments.ts";
import { isKnownTaxStatuteKey } from "./tax-statutes.ts";
import { WIZARD_LABELS } from "./types.ts";

test("registry is non-empty with complete core fields", () => {
  assert.ok(TAX_INSTRUMENTS.length >= 1);
  for (const i of TAX_INSTRUMENTS) {
    assert.ok(i.label && i.purpose && i.recipient_guidance, `${i.key} core fields`);
    assert.ok(i.required_fields.length > 0, `${i.key} required fields`);
    assert.ok(i.triggers.length > 0, `${i.key} triggers`);
  }
});

test("instrument keys are unique", () => {
  const keys = TAX_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every instrument routes through a real wizard type", () => {
  for (const i of TAX_INSTRUMENTS) assert.ok(i.wizard_type in WIZARD_LABELS, `${i.key} ${i.wizard_type}`);
});

test("every referenced statute key resolves", () => {
  for (const i of TAX_INSTRUMENTS) {
    for (const key of i.relevant_statutes) {
      assert.ok(isKnownTaxStatuteKey(key), `${i.key} references unknown statute ${key}`);
    }
  }
});

test("CDP request is flagged high_stakes", () => {
  assert.equal(getTaxInstrument("collection_due_process_request")?.high_stakes, true);
});

test("lookup + prompt catalog + field hint", () => {
  assert.ok(isKnownTaxInstrumentKey("irs_notice_response"));
  assert.ok(!isKnownTaxInstrumentKey("nope"));
  const catalog = taxInstrumentsForPrompt();
  for (const i of TAX_INSTRUMENTS) assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  assert.ok(taxInstrumentFieldHint("irs_notice_response")?.includes("Required fields:"));
  assert.equal(taxInstrumentFieldHint("nope"), null);
});

test("looksLikeTaxMatter catches tax controversy but not generic filing", () => {
  for (const t of ["irs notice", "back taxes", "tax audit", "innocent spouse", "cp2000"]) {
    assert.ok(looksLikeTaxMatter(t), `should detect ${t}`);
  }
  assert.ok(looksLikeTaxMatter("The IRS sent me a Final Notice of Intent to Levy."));
  assert.ok(!looksLikeTaxMatter("how do I file my 1040"));
  assert.ok(!looksLikeTaxMatter("HOA violation notice"));
  assert.ok(!looksLikeTaxMatter(null));
});

test("offline keyword fallback maps situations to instruments", () => {
  assert.ok(matchTaxInstrumentsByText("request a CDP hearing").map((i) => i.key).includes("collection_due_process_request"));
  assert.ok(matchTaxInstrumentsByText("innocent spouse relief").map((i) => i.key).includes("innocent_spouse_relief_request"));
});
