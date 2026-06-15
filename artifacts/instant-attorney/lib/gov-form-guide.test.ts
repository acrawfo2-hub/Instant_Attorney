import { test } from "node:test";
import assert from "node:assert/strict";
import { getGovernmentForm } from "./government-forms.ts";
import {
  validateField,
  applyAnswers,
  nextUnansweredField,
  computeProgress,
  guideState,
  resolveForm,
  normalizeFormDef,
} from "./gov-form-guide.ts";
import type { GovFormField } from "./government-forms.ts";
import type { GovFormDefinition } from "./types.ts";

const ssn: GovFormField = { name: "ssn", label: "SSN", type: "ssn" };
const dob: GovFormField = { name: "dob", label: "DOB", type: "date" };
const yn: GovFormField = { name: "citizen", label: "Citizen?", type: "boolean" };
const status: GovFormField = { name: "fs", label: "Filing status", type: "enum", options: ["Single", "Head of household"] };

test("ssn validation normalizes to dashed form and rejects junk", () => {
  assert.deepEqual(validateField(ssn, "123456789"), { ok: true, value: "123-45-6789" });
  assert.deepEqual(validateField(ssn, "123-45-6789"), { ok: true, value: "123-45-6789" });
  assert.equal(validateField(ssn, "12-34").ok, false);
});

test("date requires ISO format", () => {
  assert.equal(validateField(dob, "1990-05-01").ok, true);
  assert.equal(validateField(dob, "May 1 1990").ok, false);
});

test("boolean accepts yes/no and native booleans", () => {
  assert.deepEqual(validateField(yn, "yes"), { ok: true, value: true });
  assert.deepEqual(validateField(yn, "n"), { ok: true, value: false });
  assert.deepEqual(validateField(yn, true), { ok: true, value: true });
  assert.equal(validateField(yn, "maybe").ok, false);
});

test("enum is case-insensitive and canonicalizes", () => {
  assert.deepEqual(validateField(status, "single"), { ok: true, value: "Single" });
  assert.equal(validateField(status, "married").ok, false);
});

test("required empty fails, optional empty passes", () => {
  assert.equal(validateField(ssn, "").ok, false);
  assert.equal(validateField({ name: "x", label: "X", type: "number", required: false }, "").ok, true);
});

test("applyAnswers collects valid answers and per-field errors", () => {
  const form = getGovernmentForm("irs-w4")!;
  const { answers, errors } = applyAnswers(form, {
    full_name: "Jane Doe",
    ssn: "123456789",
    filing_status: "married filing jointly",
    multiple_jobs: "no",
    unknown_field: "ignored",
  });
  assert.equal(answers.full_name, "Jane Doe");
  assert.equal(answers.ssn, "123-45-6789");
  assert.equal(answers.filing_status, "Married filing jointly");
  assert.equal(answers.multiple_jobs, false);
  assert.equal("unknown_field" in answers, false);
  assert.deepEqual(errors, {});
});

test("progress + nextUnansweredField track required completion", () => {
  const form = getGovernmentForm("voter-registration")!;
  const partial = { full_name: "Jane Doe" };
  const next = nextUnansweredField(form, partial);
  assert.ok(next && next.name !== "full_name");

  const p = computeProgress(form, partial);
  assert.equal(p.complete, false);
  assert.ok(p.percent > 0 && p.percent < 100);

  const all: Record<string, unknown> = {};
  for (const f of form.fields) all[f.name] = f.type === "boolean" ? true : "x";
  assert.equal(computeProgress(form, all).complete, true);
});

test("guideState returns null for unknown form, full state for known", () => {
  assert.equal(guideState("nope", {}), null);
  const state = guideState("irs-w4", {});
  assert.ok(state);
  assert.ok(state!.checklist.some((line) => line.includes("irs.gov")));
});

test("resolveForm prefers the registry, falls back to a dynamic form_def", () => {
  // Registry instrument resolves to the curated form.
  const reg = resolveForm({ form_key: "irs-w4", source: "registry", form_def: null });
  assert.equal(reg?.form_number, "Form W-4");

  // Dynamic instrument resolves to its stored definition.
  const def: GovFormDefinition = {
    key: "dyn-x", form_number: "X-1", title: "X", agency: "A", jurisdiction: "CA",
    state_specific: false, official_url: "https://dmv.ca.gov", revision: "unverified",
    purpose: "", who_needs_it: "", deadline: "", fee: "", submit_to: "",
    fields: [{ name: "a", label: "A", type: "weird" }], common_mistakes: [], triggers: [],
  };
  const dyn = resolveForm({ form_key: "dyn-x", source: "dynamic", form_def: def });
  assert.equal(dyn?.form_number, "X-1");
  // Loose field type is normalized to a valid GovFormFieldType.
  assert.equal(dyn?.fields[0].type, "string");

  // Unknown key with no def → null.
  assert.equal(resolveForm({ form_key: "dyn-missing", source: "dynamic", form_def: null }), null);
});

test("normalizeFormDef keeps valid field types", () => {
  const def: GovFormDefinition = {
    key: "dyn-y", form_number: "Y", title: "Y", agency: "A", jurisdiction: "CA",
    state_specific: false, official_url: "https://x.gov", revision: "u",
    purpose: "", who_needs_it: "", deadline: "", fee: "", submit_to: "",
    fields: [{ name: "d", label: "Date", type: "date" }], common_mistakes: [], triggers: [],
  };
  assert.equal(normalizeFormDef(def).fields[0].type, "date");
});
