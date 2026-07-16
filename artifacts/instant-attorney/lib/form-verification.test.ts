import { test } from "node:test";
import assert from "node:assert/strict";
import { buildVerificationPrompt, parseVerificationResponse } from "./form-verification.ts";
import type { GovernmentForm } from "./government-forms.ts";

const form: GovernmentForm = {
  key: "test-form",
  form_number: "Form T-1",
  title: "Test Form",
  agency: "Test Agency",
  jurisdiction: "Federal",
  state_specific: false,
  official_url: "https://example.gov/t1",
  revision: "2025",
  purpose: "Testing.",
  who_needs_it: "Testers.",
  deadline: "N/A",
  fee: "None",
  submit_to: "Nowhere",
  fields: [
    { name: "full_name", label: "Full legal name", type: "string" },
    { name: "dob", label: "Date of birth", type: "date" },
    { name: "citizen", label: "U.S. citizen?", type: "boolean" },
    { name: "middle_name", label: "Middle name", type: "string", required: false },
  ],
  common_mistakes: [],
  triggers: [],
};

const answers = {
  full_name: "Jane Q. Public",
  dob: "1990-05-01",
  citizen: true,
};

test("buildVerificationPrompt lists every field with its expected value", () => {
  const prompt = buildVerificationPrompt(form, answers);
  assert.match(prompt, /full_name :: "Full legal name" — expected value: Jane Q\. Public/);
  assert.match(prompt, /dob :: "Date of birth" — expected value: 1990-05-01/);
  assert.match(prompt, /citizen :: "U\.S\. citizen\?" — expected value: Yes/);
  assert.match(prompt, /middle_name :: "Middle name" — expected value: \(not collected in chat\)/);
  assert.match(prompt, /Form T-1/);
});

function block(field: string, seen: string, matchYesNo: "yes" | "no", note?: string): string {
  return `FIELD: ${field}\nSEEN: ${seen}\nMATCH: ${matchYesNo}\n${note ? `NOTE: ${note}\n` : ""}`;
}

test("parseVerificationResponse extracts per-field results and overall status", () => {
  const text = `---FORM VERIFICATION---
${block("full_name", "Jane Q. Public", "yes")}${block("dob", "05/01/1990", "yes")}${block("citizen", "Yes", "yes")}${block("middle_name", "(blank)", "no", "Optional field left blank.")}OVERALL: verified
SUMMARY: Looks complete and correct.
---END VERIFICATION---`;

  const parsed = parseVerificationResponse(text, form, answers);
  assert.equal(parsed.status, "verified");
  assert.equal(parsed.summary, "Looks complete and correct.");
  assert.equal(parsed.fieldResults.length, 4);

  const byField = Object.fromEntries(parsed.fieldResults.map((r) => [r.field, r]));
  assert.equal(byField.full_name.match, true);
  assert.equal(byField.full_name.seen, "Jane Q. Public");
  assert.equal(byField.full_name.expected, "Jane Q. Public");
  assert.equal(byField.middle_name.match, false);
  assert.equal(byField.middle_name.seen, null);
  assert.equal(byField.middle_name.note, "Optional field left blank.");
});

test("parseVerificationResponse flags a genuine mismatch", () => {
  const text = `---FORM VERIFICATION---
${block("full_name", "Jane Public", "no", "Middle initial missing vs. chat answer.")}${block("dob", "1990-05-01", "yes")}${block("citizen", "Yes", "yes")}${block("middle_name", "(blank)", "yes")}OVERALL: mismatch
SUMMARY: The legal name doesn't fully match what was collected.
---END VERIFICATION---`;

  const parsed = parseVerificationResponse(text, form, answers);
  assert.equal(parsed.status, "mismatch");
  const byField = Object.fromEntries(parsed.fieldResults.map((r) => [r.field, r]));
  assert.equal(byField.full_name.match, false);
  assert.equal(byField.full_name.note, "Middle initial missing vs. chat answer.");
});

test("parseVerificationResponse derives status from fields when OVERALL is missing", () => {
  const text = `---FORM VERIFICATION---
${block("full_name", "Jane Q. Public", "yes")}${block("dob", "1990-05-01", "yes")}${block("citizen", "Yes", "yes")}${block("middle_name", "(blank)", "yes")}---END VERIFICATION---`;

  const parsed = parseVerificationResponse(text, form, answers);
  assert.equal(parsed.status, "verified");
});

test("parseVerificationResponse falls back to needs_review on unparseable text", () => {
  const parsed = parseVerificationResponse("the model said something unexpected", form, answers);
  assert.equal(parsed.status, "needs_review");
  assert.equal(parsed.summary, null);
  // Every declared field still gets a result, flagged as unreadable.
  assert.equal(parsed.fieldResults.length, form.fields.length);
  assert.ok(parsed.fieldResults.every((r) => r.match === false && r.seen === null));
});

test("parseVerificationResponse handles a field the model skipped", () => {
  const text = `---FORM VERIFICATION---
${block("full_name", "Jane Q. Public", "yes")}${block("dob", "1990-05-01", "yes")}${block("citizen", "Yes", "yes")}OVERALL: needs_review
SUMMARY: Middle name field not visible in the photo.
---END VERIFICATION---`;

  const parsed = parseVerificationResponse(text, form, answers);
  const byField = Object.fromEntries(parsed.fieldResults.map((r) => [r.field, r]));
  assert.equal(byField.middle_name.match, false);
  assert.equal(byField.middle_name.seen, null);
  assert.match(byField.middle_name.note ?? "", /clearer picture/);
});
