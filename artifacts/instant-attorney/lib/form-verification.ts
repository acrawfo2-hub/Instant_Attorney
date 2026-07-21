// ── Screenshot verification for hand-filled government forms ────────────────
//
// Fallback path for a form_instrument (see lib/gov-form-guide.ts) when the client
// fills the form out on paper (or a PDF viewer we can't auto-fill) instead of a
// fillable PDF. They upload photos/screenshots of the completed pages; the AI
// reads what's on the page and checks it against the answers already collected
// in chat, field by field.
//
// Pure, testable logic only — no Anthropic/Supabase imports, so this can be
// unit-tested without the model or DB (same split as lib/gov-form-guide.ts). The
// orchestration that calls Claude and writes results back lives in
// lib/form-verification-runner.ts.

import type { GovernmentForm, GovFormField } from "./government-forms.ts";
import type { FieldVerificationResult, FormVerificationStatus } from "./types.ts";

function formatExpected(field: GovFormField, value: unknown): string {
  if (value === undefined || value === null || value === "") return "(not collected in chat)";
  if (field.type === "boolean") return value ? "Yes" : "No";
  return String(value);
}

/** Pure prompt builder: lists every field this form expects, with the value the
 * client already gave in chat (if any), and asks the model to read the uploaded
 * photos/screenshots of the hand-filled form and check each one off. */
export function buildVerificationPrompt(
  form: GovernmentForm,
  answers: Record<string, unknown>
): string {
  const fieldLines = form.fields
    .map((f) => `- ${f.name} :: "${f.label}" — expected value: ${formatExpected(f, answers[f.name])}`)
    .join("\n");

  return `You are checking a hand-filled or self-completed copy of ${form.form_number} (${form.title}) against answers the client already gave in an earlier chat. You are shown one or more photos/screenshots of the page(s) they filled out. For EACH field listed below, locate it on the page(s), read what the client actually wrote, and report whether it matches the expected value.

Judge sensibly: minor formatting differences (e.g. "01/05/1990" vs "1990-01-05", or a full state name vs its abbreviation) still count as a match if the underlying value is the same. Only mark MATCH as "no" when the values genuinely conflict, or the field is blank/illegible where a real answer was expected. When the expected value is "(not collected in chat)" we have nothing to compare against — just report what's on the page and mark MATCH "yes" if the client filled in something reasonable for that field, "no" if it's blank there too.

Fields to check:
${fieldLines}

Produce your analysis in EXACTLY this format, one FIELD/SEEN/MATCH/NOTE group per field above, in the same order:

---FORM VERIFICATION---
FIELD: field_name_here
SEEN: [what you read on the page, verbatim, or "(blank)" or "(illegible)"]
MATCH: yes|no
NOTE: [one short line, only when MATCH is no or something is worth flagging — otherwise omit this line]
OVERALL: verified|mismatch|needs_review
SUMMARY: [1-3 sentences: is this form correctly and completely filled out? Call out anything missing, illegible, or wrong. Use needs_review instead of a hard mismatch when the photo itself is blurry, cut off, or hard to read rather than the answer being genuinely wrong.]
---END VERIFICATION---`;
}

export interface ParsedVerification {
  status: FormVerificationStatus;
  summary: string | null;
  fieldResults: FieldVerificationResult[];
}

const OVERALL_STATUSES = new Set<string>(["verified", "mismatch", "needs_review"]);

/** Pure parser for the structured response above. Always returns one result per
 * form field (in form order), even if the model skipped one — falls back to
 * "needs_review" for anything that didn't parse cleanly. */
export function parseVerificationResponse(
  text: string,
  form: GovernmentForm,
  answers: Record<string, unknown>
): ParsedVerification {
  const sectionMatch = text.match(/---FORM VERIFICATION---([\s\S]*?)---END VERIFICATION---/);
  const body = sectionMatch ? sectionMatch[1] : text;

  const seenByField = new Map<string, { seen: string | null; match: boolean; note?: string }>();
  const blockRe = /FIELD:\s*(\S+)[^\n]*\nSEEN:\s*([^\n]*)\nMATCH:\s*(yes|no)\b[^\n]*\n(?:NOTE:\s*([^\n]*)\n)?/gi;
  let m: RegExpExecArray | null;
  while ((m = blockRe.exec(body)) !== null) {
    const seenRaw = m[2].trim();
    seenByField.set(m[1].trim(), {
      seen: seenRaw && !/^\(blank\)$/i.test(seenRaw) ? seenRaw : null,
      match: m[3].toLowerCase() === "yes",
      note: m[4]?.trim() || undefined,
    });
  }

  const fieldResults: FieldVerificationResult[] = form.fields.map((field) => {
    const parsed = seenByField.get(field.name);
    return {
      field: field.name,
      label: field.label,
      expected: formatExpected(field, answers[field.name]),
      seen: parsed?.seen ?? null,
      match: parsed?.match ?? false,
      note: parsed?.note ?? (parsed ? undefined : "Could not be read from the photo(s) — please upload a clearer picture of this field."),
    };
  });

  const overallMatch = body.match(/OVERALL:\s*(verified|mismatch|needs_review)/i);
  const summaryMatch = body.match(/SUMMARY:\s*([\s\S]*?)(?=\n---|$)/i);

  let status: FormVerificationStatus;
  if (overallMatch && OVERALL_STATUSES.has(overallMatch[1].toLowerCase())) {
    status = overallMatch[1].toLowerCase() as FormVerificationStatus;
  } else if (seenByField.size > 0) {
    status = fieldResults.every((r) => r.match) ? "verified" : "mismatch";
  } else {
    status = "needs_review";
  }

  return {
    status,
    summary: summaryMatch?.[1]?.trim() || null,
    fieldResults,
  };
}
