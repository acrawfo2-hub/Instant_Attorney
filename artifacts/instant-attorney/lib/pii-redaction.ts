// ── PII redaction ────────────────────────────────────────────────────────────
//
// Milestone 5 of docs/financial-picture-spec.md. A pure utility that masks
// sensitive identifiers in free text — SSNs, card/account/routing numbers — so
// they don't get persisted in plain fields or sent to the model. Applied to
// financial-item text on ingest (the label always shows a redacted form), and
// available for attachment summaries and chat.
//
// Conservative: it masks things that look like identifiers (long digit runs,
// dashed SSNs, card-formatted groups) while leaving ordinary money amounts
// ($1,200) and short numbers alone.
//
// Pure + testable.

export interface RedactionResult {
  text: string;
  /** How many identifiers were masked. */
  count: number;
}

// Mask all but the last 4 digits of a digit string, preserving length feel.
function maskKeepLast4(digits: string): string {
  if (digits.length <= 4) return digits;
  return "•".repeat(Math.max(4, digits.length - 4)) + digits.slice(-4);
}

const SSN_RE = /\b(\d{3})-(\d{2})-(\d{4})\b/g;
// Card / account groups: 13–19 digits possibly separated by spaces or dashes.
const GROUPED_RE = /\b(?:\d[ -]?){12,18}\d\b/g;
// Bare long digit runs (account/routing/SSN-like): 8–18 digits. Starting at 8
// keeps ordinary amounts written without commas (e.g. 1500000) out of scope.
const LONG_RUN_RE = /\b\d{8,18}\b/g;

/**
 * Redact identifiers in free text. SSNs keep their dashed shape (•••-••-1234);
 * card/account/long runs keep only their last 4 digits.
 */
export function redactPII(input: string | null | undefined): RedactionResult {
  if (!input) return { text: input ?? "", count: 0 };
  let count = 0;
  let text = input;

  text = text.replace(SSN_RE, (_m, _a, _b, d4) => {
    count++;
    return `•••-••-${d4}`;
  });

  text = text.replace(GROUPED_RE, (m) => {
    const digits = m.replace(/\D/g, "");
    if (digits.length < 13) return m; // not actually a card/account group
    count++;
    return maskKeepLast4(digits);
  });

  text = text.replace(LONG_RUN_RE, (m) => {
    count++;
    return maskKeepLast4(m);
  });

  return { text, count };
}

/** True if the text appears to contain a sensitive identifier. */
export function containsPII(input: string | null | undefined): boolean {
  return redactPII(input).count > 0;
}
