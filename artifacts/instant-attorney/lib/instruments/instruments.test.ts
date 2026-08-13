import assert from "node:assert/strict";
import test from "node:test";
import { INSTRUMENT_PROFILES, resolveInstrumentProfile } from "./index.ts";
import { instrumentFieldGuidance } from "../prompts.ts";

test("the six stable profiles satisfy the composable instrument schema", () => {
  assert.deepEqual(INSTRUMENT_PROFILES.map((p) => p.instrument_key), [
    "business_letter", "federal_foia_request", "texas_public_information_request",
    "civil_complaint_petition", "individual_will", "revocable_trust",
  ]);
  for (const profile of INSTRUMENT_PROFILES) {
    assert.ok(profile.title && profile.engine && profile.risk_level);
    for (const key of ["required_facts", "conditional_questions", "required_sections", "optional_sections", "prohibited_assumptions", "execution_or_filing_rules", "companion_documents", "authority_references"] as const) {
      assert.ok(Array.isArray(profile[key]) && profile[key].length > 0, `${profile.instrument_key}.${key}`);
    }
    assert.ok(profile.output_profile.format && profile.output_profile.tone);
    assert.equal(resolveInstrumentProfile(profile.instrument_key), profile);
  }
});

test("guidance composes the engine and instrument profile", () => {
  const foia = instrumentFieldGuidance("general_document", "federal_foia_request");
  const texas = instrumentFieldGuidance("general_document", "texas_public_information_request");
  assert.match(foia, /Required fields vary by instrument/);
  assert.match(foia, /5 U\.S\.C\. § 552/);
  assert.match(texas, /Texas Government Code Chapter 552/);
  assert.notEqual(foia, texas);
});
