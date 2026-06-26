import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIEN_INSTRUMENTS,
  getLienInstrument,
  isKnownLienInstrumentKey,
  lienInstrumentsForPrompt,
  lienInstrumentFieldHint,
  matchLienInstrumentsByText,
  looksLikeLienMatter,
} from "./lien-instruments.ts";
import { isKnownLienStatuteKey } from "./lien-statutes.ts";
import { WIZARD_LABELS } from "./types.ts";

test("every instrument references valid statute keys and wizard types", () => {
  for (const inst of LIEN_INSTRUMENTS) {
    assert.ok(WIZARD_LABELS[inst.wizard_type], `${inst.key} wizard_type`);
    for (const sk of inst.relevant_statutes) {
      assert.ok(isKnownLienStatuteKey(sk), `${inst.key} → ${sk}`);
    }
    assert.ok(inst.triggers.length > 0, `${inst.key} triggers`);
  }
});

test("instrument keys are unique", () => {
  const keys = LIEN_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup helpers", () => {
  assert.ok(isKnownLienInstrumentKey("mechanics_lien_response"));
  assert.ok(!isKnownLienInstrumentKey("nope"));
  assert.equal(getLienInstrument("mortgage_foreclosure_response")?.high_stakes, true);
});

test("prompt catalog lists every instrument key", () => {
  const catalog = lienInstrumentsForPrompt();
  for (const i of LIEN_INSTRUMENTS) {
    assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  }
});

test("looksLikeLienMatter catches lien matters but not HOA", () => {
  for (const t of ["mechanic's lien", "foreclosure", "title exception", "abstract of judgment"]) {
    assert.ok(looksLikeLienMatter(t), `should detect ${t}`);
  }
  assert.ok(looksLikeLienMatter("Contractor recorded a lien affidavit on my property."));
  assert.ok(!looksLikeLienMatter("HOA assessment lien and foreclosure notice"));
  assert.ok(!looksLikeLienMatter("divorce with two kids"));
  assert.ok(!looksLikeLienMatter(null));
});

test("offline keyword fallback maps situations to instruments", () => {
  const mech = matchLienInstrumentsByText("contractor filed a mechanics lien").map((i) => i.key);
  assert.ok(mech.includes("mechanics_lien_response"));

  const fc = matchLienInstrumentsByText("notice of sale foreclosure").map((i) => i.key);
  assert.ok(fc.includes("mortgage_foreclosure_response"));
});

test("field hint includes required fields", () => {
  assert.ok(lienInstrumentFieldHint("payoff_demand_letter")?.includes("Required fields:"));
  assert.equal(lienInstrumentFieldHint("nope"), null);
});
