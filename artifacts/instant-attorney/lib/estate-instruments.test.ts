import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTATE_DOC_INSTRUMENTS,
  getEstateDocInstrument,
  isKnownEstateDocInstrumentKey,
  estateInstrumentsForPrompt,
  estateInstrumentFieldHint,
  matchEstateInstrumentsByText,
  looksLikeEstateMatter,
} from "./estate-instruments.ts";
import { isKnownEstateStatuteKey } from "./estate-statutes.ts";
import { WIZARD_LABELS } from "./types.ts";

test("every instrument has complete fields and resolvable references", () => {
  assert.ok(ESTATE_DOC_INSTRUMENTS.length >= 1);
  for (const i of ESTATE_DOC_INSTRUMENTS) {
    assert.ok(i.label && i.purpose && i.recipient_guidance, `${i.key} core fields`);
    assert.ok(i.required_fields.length > 0, `${i.key} required fields`);
    assert.ok(i.triggers.length > 0, `${i.key} triggers`);
    // wizard_type must be a real drafting engine.
    assert.ok(i.wizard_type in WIZARD_LABELS, `${i.key} bad wizard_type ${i.wizard_type}`);
    for (const k of i.relevant_statutes) assert.ok(isKnownEstateStatuteKey(k), `${i.key} bad statute ${k}`);
  }
});

test("instrument keys are unique", () => {
  const keys = ESTATE_DOC_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("the core estate documents are present and draft via a real engine", () => {
  for (const key of [
    "last_will_testament",
    "statutory_durable_poa",
    "medical_power_of_attorney",
    "directive_to_physicians",
    "transfer_on_death_deed",
    "revocable_living_trust",
    "pour_over_will",
    "special_needs_trust",
  ]) {
    assert.ok(isKnownEstateDocInstrumentKey(key), `missing ${key}`);
  }
  // A will drafts through the dedicated wills_trusts engine; a deed is a general document.
  assert.equal(getEstateDocInstrument("last_will_testament")?.wizard_type, "wills_trusts");
  assert.equal(getEstateDocInstrument("transfer_on_death_deed")?.wizard_type, "general_document");
});

test("trust documents are high-stakes (route to attorney review); a basic will is not", () => {
  for (const key of ["revocable_living_trust", "special_needs_trust", "pour_over_will"]) {
    assert.equal(getEstateDocInstrument(key)?.high_stakes, true, `${key} should be high-stakes`);
  }
  assert.equal(getEstateDocInstrument("last_will_testament")?.high_stakes, false);
  assert.equal(getEstateDocInstrument("statutory_durable_poa")?.high_stakes, false);
});

test("the TOD deed instrument insists on recording before death", () => {
  const todd = getEstateDocInstrument("transfer_on_death_deed");
  assert.ok(todd, "todd present");
  assert.match(todd.recipient_guidance, /record/i);
  assert.match(todd.recipient_guidance, /before death/i);
});

test("prompt catalog lists every key and flags high-stakes instruments", () => {
  const catalog = estateInstrumentsForPrompt();
  for (const i of ESTATE_DOC_INSTRUMENTS) assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  assert.match(catalog, /revocable_living_trust.*HIGH-STAKES/);
});

test("field hint surfaces required fields; unknown key returns null", () => {
  const hint = estateInstrumentFieldHint("last_will_testament");
  assert.ok(hint && /executor/i.test(hint));
  assert.equal(estateInstrumentFieldHint("nope"), null);
});

test("keyword fallback + matter detection", () => {
  assert.ok(matchEstateInstrumentsByText("I need to write a will").map((i) => i.key).includes("last_will_testament"));
  assert.ok(matchEstateInstrumentsByText("set up a trust for my kids").map((i) => i.key).includes("revocable_living_trust"));
  assert.ok(looksLikeEstateMatter("estate planning"));
  assert.ok(looksLikeEstateMatter("I want a power of attorney"));
  assert.ok(!looksLikeEstateMatter("my landlord won't return my deposit"));
});
