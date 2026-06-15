import { test } from "node:test";
import assert from "node:assert/strict";
import { getGovernmentForm } from "./government-forms.ts";
import {
  validateField,
  applyAnswers,
  nextUnansweredField,
  computeProgress,
  guideState,
} from "./gov-form-guide.ts";
import type { GovFormField } from "./government-forms.ts";

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
