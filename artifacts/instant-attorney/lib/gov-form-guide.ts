// ── Guided government-form completion ────────────────────────────────────────
//
// Pure, testable logic for walking a client through a government form field by
// field: validating answers, finding the next unanswered field, and computing
// progress + a submission checklist. The interactive AI layer (explanations,
// conversational help) sits on top of this in the gov-form guide route; this
// module is deterministic so it can be unit-tested without the model or DB.

import { getGovernmentForm } from "./government-forms.ts";
import type { GovFormField, GovernmentForm } from "./government-forms.ts";

export interface FieldValidation {
  ok: boolean;
  /** Normalized value to persist when ok. */
  value?: unknown;
  error?: string;
}

const SSN_RE = /^\d{3}-?\d{2}-?\d{4}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/; // ISO date (yyyy-mm-dd)

/** Validate and normalize a single field answer. */
export function validateField(field: GovFormField, raw: unknown): FieldValidation {
  const required = field.required !== false;

  // Empty handling.
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    if (required) return { ok: false, error: `${field.label} is required.` };
    return { ok: true, value: null };
  }

  switch (field.type) {
    case "ssn": {
      const digits = String(raw).replace(/\D/g, "");
      if (!SSN_RE.test(String(raw)) || digits.length !== 9) {
        return { ok: false, error: "Enter a valid 9-digit Social Security Number (e.g. 123-45-6789)." };
      }
      // Normalize to dashed form.
      return { ok: true, value: `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` };
    }
    case "date": {
      const s = String(raw).trim();
      if (!DATE_RE.test(s) || Number.isNaN(Date.parse(s))) {
        return { ok: false, error: "Enter a valid date in YYYY-MM-DD format." };
      }
      return { ok: true, value: s };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number(String(raw).replace(/[$,]/g, "").trim());
      if (Number.isNaN(n)) return { ok: false, error: `${field.label} must be a number.` };
      return { ok: true, value: n };
    }
    case "boolean": {
      if (typeof raw === "boolean") return { ok: true, value: raw };
      const s = String(raw).trim().toLowerCase();
      if (["yes", "y", "true", "1"].includes(s)) return { ok: true, value: true };
      if (["no", "n", "false", "0"].includes(s)) return { ok: true, value: false };
      return { ok: false, error: `Answer ${field.label} with yes or no.` };
    }
    case "enum": {
      const s = String(raw).trim();
      const match = field.options?.find((o) => o.toLowerCase() === s.toLowerCase());
      if (!match) {
        return { ok: false, error: `Choose one of: ${(field.options ?? []).join(", ")}.` };
      }
      return { ok: true, value: match };
    }
    case "string":
    case "address":
    default:
      return { ok: true, value: String(raw).trim() };
  }
}

export interface AnswerResult {
  answers: Record<string, unknown>;
  errors: Record<string, string>;
}

/** Validate a batch of answers against a form; returns normalized answers and
 * per-field errors. Unknown field names are ignored. */
export function applyAnswers(
  form: GovernmentForm,
  raw: Record<string, unknown>
): AnswerResult {
  const answers: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const field of form.fields) {
    if (!(field.name in raw)) continue;
    const result = validateField(field, raw[field.name]);
    if (result.ok) {
      if (result.value !== null && result.value !== undefined) answers[field.name] = result.value;
    } else {
      errors[field.name] = result.error ?? "Invalid value.";
    }
  }
  return { answers, errors };
}

/** The next required field that still has no valid answer, or null if complete. */
export function nextUnansweredField(
  form: GovernmentForm,
  answers: Record<string, unknown>
): GovFormField | null {
  for (const field of form.fields) {
    if (field.required === false) continue;
    const v = answers[field.name];
    if (v === undefined || v === null || v === "") return field;
  }
  return null;
}

export interface FormProgress {
  total_required: number;
  answered_required: number;
  percent: number;
  complete: boolean;
  next_field: GovFormField | null;
}

export function computeProgress(
  form: GovernmentForm,
  answers: Record<string, unknown>
): FormProgress {
  const required = form.fields.filter((f) => f.required !== false);
  const answered = required.filter((f) => {
    const v = answers[f.name];
    return v !== undefined && v !== null && v !== "";
  });
  const next = nextUnansweredField(form, answers);
  const total = required.length;
  return {
    total_required: total,
    answered_required: answered.length,
    percent: total === 0 ? 100 : Math.round((answered.length / total) * 100),
    complete: next === null,
    next_field: next,
  };
}

/** A human-facing submission checklist once a form is complete (or in progress). */
export function buildSubmissionChecklist(form: GovernmentForm): string[] {
  return [
    `Review every answer for accuracy — especially names, dates, and numbers.`,
    `Where to submit: ${form.submit_to}`,
    `Deadline: ${form.deadline}`,
    `Fee: ${form.fee}`,
    `Get the official, current form here: ${form.official_url}`,
    `Keep a copy of everything you submit.`,
  ];
}

/** Convenience: resolve a form by key and compute progress in one call. Returns
 * null if the key is unknown. */
export function guideState(
  formKey: string,
  answers: Record<string, unknown>
): { form: GovernmentForm; progress: FormProgress; checklist: string[] } | null {
  const form = getGovernmentForm(formKey);
  if (!form) return null;
  return {
    form,
    progress: computeProgress(form, answers),
    checklist: buildSubmissionChecklist(form),
  };
}
