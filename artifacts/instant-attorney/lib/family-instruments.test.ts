import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FAMILY_INSTRUMENTS,
  getFamilyInstrument,
  isKnownFamilyInstrumentKey,
  familyInstrumentsForPrompt,
  familyInstrumentFieldHint,
  matchFamilyInstrumentsByText,
  looksLikeFamilyMatter,
} from "./family-instruments.ts";
import { isKnownFamilyStatuteKey } from "./family-statutes.ts";
import { INSTRUMENT_LABELS } from "./types.ts";

test("registry is non-empty with complete core fields", () => {
  assert.ok(FAMILY_INSTRUMENTS.length >= 1);
  for (const i of FAMILY_INSTRUMENTS) {
    assert.ok(i.label && i.purpose && i.recipient_guidance, `${i.key} core fields`);
    assert.ok(i.required_fields.length > 0, `${i.key} has required fields`);
    assert.ok(i.triggers.length > 0, `${i.key} has triggers`);
  }
});

test("instrument keys are unique", () => {
  const keys = FAMILY_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every instrument routes through a real instrument type (no new DocType/enum)", () => {
  for (const i of FAMILY_INSTRUMENTS) {
    assert.ok(i.engine in INSTRUMENT_LABELS, `${i.key} engine ${i.engine}`);
  }
});

test("every referenced statute key resolves to a real statute", () => {
  for (const i of FAMILY_INSTRUMENTS) {
    for (const key of i.relevant_statutes) {
      assert.ok(isKnownFamilyStatuteKey(key), `${i.key} references unknown statute ${key}`);
    }
  }
});

test("safety-critical instruments are flagged high_stakes", () => {
  assert.equal(getFamilyInstrument("protective_order_application")?.high_stakes, true);
  assert.equal(getFamilyInstrument("final_decree_divorce")?.high_stakes, true);
});

test("lookup + key membership helpers", () => {
  assert.ok(isKnownFamilyInstrumentKey("child_support_proposal"));
  assert.ok(!isKnownFamilyInstrumentKey("totally-made-up"));
  assert.equal(getFamilyInstrument("nope"), undefined);
});

test("prompt catalog lists every key; field hint resolves", () => {
  const catalog = familyInstrumentsForPrompt();
  for (const i of FAMILY_INSTRUMENTS) {
    assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  }
  const hint = familyInstrumentFieldHint("child_support_proposal");
  assert.ok(hint && hint.includes("Required fields:"));
  assert.equal(familyInstrumentFieldHint("nope"), null);
});

test("looksLikeFamilyMatter catches terse subtypes and richer summaries", () => {
  // Terse matter subtypes that match no multi-word instrument trigger.
  for (const t of ["divorce", "custody", "child support", "conservatorship", "paternity"]) {
    assert.ok(looksLikeFamilyMatter(t), `should detect ${t}`);
  }
  // Richer summary text.
  assert.ok(looksLikeFamilyMatter("Client wants to file for divorce and set up a parenting plan."));
  // Non-family matters are not flagged.
  assert.ok(!looksLikeFamilyMatter("HOA violation notice and fine dispute"));
  assert.ok(!looksLikeFamilyMatter("wrongful termination at work"));
  assert.ok(!looksLikeFamilyMatter(null));
  assert.ok(!looksLikeFamilyMatter(""));
});

test("offline keyword fallback maps situations to instruments", () => {
  const enforce = matchFamilyInstrumentsByText("my ex is behind on support and denied my visitation").map((i) => i.key);
  assert.ok(enforce.includes("motion_to_enforce"));

  const safety = matchFamilyInstrumentsByText("there has been domestic violence and I am afraid").map((i) => i.key);
  assert.ok(safety.includes("protective_order_application"));
});
