import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EMPLOYMENT_INSTRUMENTS,
  getEmploymentInstrument,
  isKnownEmploymentInstrumentKey,
  employmentInstrumentsForPrompt,
  employmentInstrumentFieldHint,
  matchEmploymentInstrumentsByText,
  looksLikeEmploymentMatter,
} from "./employment-instruments.ts";
import { isKnownEmploymentStatuteKey } from "./employment-statutes.ts";
import { WIZARD_LABELS } from "./types.ts";

test("registry is non-empty with complete core fields", () => {
  assert.ok(EMPLOYMENT_INSTRUMENTS.length >= 1);
  for (const i of EMPLOYMENT_INSTRUMENTS) {
    assert.ok(i.label && i.purpose && i.recipient_guidance, `${i.key} core fields`);
    assert.ok(i.required_fields.length > 0, `${i.key} required fields`);
    assert.ok(i.triggers.length > 0, `${i.key} triggers`);
  }
});

test("instrument keys are unique", () => {
  const keys = EMPLOYMENT_INSTRUMENTS.map((i) => i.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("every instrument routes through a real wizard type (no new DocType/enum)", () => {
  for (const i of EMPLOYMENT_INSTRUMENTS) assert.ok(i.wizard_type in WIZARD_LABELS, `${i.key} ${i.wizard_type}`);
});

test("transactional reviews use the doc_review engine", () => {
  for (const k of ["severance_review", "noncompete_review", "employer_nda_review"]) {
    assert.equal(getEmploymentInstrument(k)?.wizard_type, "doc_review", k);
  }
});

test("every referenced statute key resolves", () => {
  for (const i of EMPLOYMENT_INSTRUMENTS) {
    for (const key of i.relevant_statutes) {
      assert.ok(isKnownEmploymentStatuteKey(key), `${i.key} references unknown statute ${key}`);
    }
  }
});

test("the EEOC/TWC charge is flagged high_stakes (deadline-critical)", () => {
  assert.equal(getEmploymentInstrument("eeoc_tchra_charge")?.high_stakes, true);
});

test("lookup + prompt catalog + field hint", () => {
  assert.ok(isKnownEmploymentInstrumentKey("severance_review"));
  assert.ok(!isKnownEmploymentInstrumentKey("nope"));
  const catalog = employmentInstrumentsForPrompt();
  for (const i of EMPLOYMENT_INSTRUMENTS) assert.ok(catalog.includes(i.key), `catalog missing ${i.key}`);
  assert.ok(employmentInstrumentFieldHint("severance_review")?.includes("Required fields:"));
  assert.equal(employmentInstrumentFieldHint("nope"), null);
});

test("offline keyword fallback maps situations to instruments", () => {
  assert.ok(matchEmploymentInstrumentsByText("should I sign this severance package").map((i) => i.key).includes("severance_review"));
  assert.ok(matchEmploymentInstrumentsByText("review my non-compete before I take the job").map((i) => i.key).includes("noncompete_review"));
});

test("looksLikeEmploymentMatter catches terse subtypes and richer summaries", () => {
  for (const t of ["employment", "wrongful termination", "discrimination", "severance", "non-compete", "overtime"]) {
    assert.ok(looksLikeEmploymentMatter(t), `should detect ${t}`);
  }
  assert.ok(looksLikeEmploymentMatter("I was fired after I reported my manager."));
  assert.ok(!looksLikeEmploymentMatter("divorce with two kids"));
  assert.ok(!looksLikeEmploymentMatter("HOA violation notice"));
  assert.ok(!looksLikeEmploymentMatter(null));
});
