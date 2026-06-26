// ── Concealment / fraudulent-transfer red-flag detector ──────────────────────
//
// Milestone 4 of docs/financial-picture-spec.md. A pure, testable scanner that
// spots signs of asset concealment, fraudulent transfers, insider preferences,
// and pre-filing dissipation in what a client tells us about an asset. It NEVER
// helps shade or omit — it educates (full disclosure is a legal duty that
// protects the client) and escalates to the attorney.
//
// Detection is text-based over an item's label + acquisition note (and works on
// free text too), because we usually don't have exact transfer dates. Look-back
// windows below are documentary, surfaced in the messaging.
//
// General information, not legal advice.

import type { FinancialItem, FinancialRedFlag } from "./types.ts";

// Documentary look-back windows (confirm exact thresholds with the attorney):
//  • Bankruptcy insider preferences: ~1 year before filing (11 U.S.C. § 547).
//  • Bankruptcy / Texas fraudulent transfers (TUFTA): ~2–4 years.
export const LOOKBACK_NOTE =
  "Transfers and payments in roughly the last 1–4 years can be examined and unwound.";

interface Rule {
  code: string;
  severity: FinancialRedFlag["severity"];
  re: RegExp;
  message: string;
}

const INSIDER = "(my )?(son|daughter|brother|sister|mother|father|mom|dad|parents?|spouse|wife|husband|ex|girlfriend|boyfriend|fiance[e]?|friend|cousin|uncle|aunt|nephew|niece|in-?law|relative|my llc|my company|my business|my own trust)";

const RULES: Rule[] = [
  {
    code: "insider_transfer",
    severity: "critical",
    re: new RegExp(
      `\\b(transferr?ed|gave|moved|put|signed over|deeded|retitled|gifted)\\b[^.]{0,40}\\b(to|into|in)\\b[^.]{0,30}${INSIDER}\\b|\\bholding (it|this|that|them)?\\s*for me\\b|\\bin ${INSIDER}'?s? name\\b`,
      "i"
    ),
    message:
      "This looks like a transfer of an asset to someone close to you. Transfers made to keep an asset away from creditors or a spouse can be undone by a court — and must still be disclosed. Don't move or retitle anything else before your attorney reviews this.",
  },
  {
    code: "concealment_language",
    severity: "critical",
    re: /\b(hide|hiding|conceal|keep (it|this|them)? ?off|don'?t (list|report|include|mention)|leave (it|this|them)? ?off|under the table|off the books|keep (it|this) secret|keep this between us|so they can'?t find)\b/i,
    message:
      "It sounds like there's a wish to keep an asset off the record. We can't prepare anything that omits or disguises an asset — hiding assets in bankruptcy is a federal crime and concealment in a divorce draws sanctions. Disclosing it fully is what protects you, and there are almost always lawful options.",
  },
  {
    code: "insider_preference",
    severity: "warn",
    re: new RegExp(`\\b(paid|repaid|paid back|paid off)\\b[^.]{0,30}${INSIDER}\\b`, "i"),
    message:
      "Paying back a relative or friend shortly before a bankruptcy can be a 'preference' the trustee claws back. Flag the date and amount so your attorney can advise — don't make further insider payments first.",
  },
  {
    code: "below_market_transfer",
    severity: "warn",
    re: /\b(sold|transferr?ed|gave)\b[^.]{0,40}\b(below market|under value|for \$?1\b|for almost nothing|way under|dirt cheap|sweetheart)\b/i,
    message:
      "Selling or transferring something for far less than it's worth can be treated as a fraudulent transfer. Your attorney needs the real value and the date.",
  },
  {
    code: "pre_filing_dissipation",
    severity: "warn",
    re: /\b(withdrew|took out|cashed out|drained|emptied|maxed out|big purchase|luxury|gambl|spent it all)\b[^.]{0,30}\b(cash|account|savings|\$?\d{3,})?/i,
    message:
      "Large cash withdrawals or unusual spending right before a filing get scrutinized. Note what happened so your attorney can address it head-on.",
  },
  {
    code: "partner_dissipation",
    severity: "warn",
    re: /\b(spouse|partner|husband|wife|ex|the other side)\b[^.]{0,40}\b(hid|hiding|drained|emptied|secret account|moved money|transferr?ed|siphon)\b/i,
    message:
      "This suggests the other side may be hiding or moving assets. That cuts in your favor — we'll flag it for formal discovery so it can be traced. Save any records you have.",
  },
];

const SEVERITY_RANK: Record<FinancialRedFlag["severity"], number> = { info: 0, warn: 1, critical: 2 };

/** Scan arbitrary free text for concealment / transfer signals. */
export function scanTextForConcealment(text: string | null | undefined): FinancialRedFlag[] {
  if (!text || !text.trim()) return [];
  const hay = text;
  const flags: FinancialRedFlag[] = [];
  for (const r of RULES) {
    if (r.re.test(hay)) flags.push({ code: r.code, severity: r.severity, message: r.message });
  }
  return flags;
}

/** Scan a single financial item (its label + acquisition note). */
export function scanItemRedFlags(item: Pick<FinancialItem, "label" | "acquisition_note">): FinancialRedFlag[] {
  return scanTextForConcealment(`${item.label ?? ""}. ${item.acquisition_note ?? ""}`);
}

export function highestSeverity(flags: FinancialRedFlag[]): FinancialRedFlag["severity"] | null {
  if (flags.length === 0) return null;
  return flags.reduce((m, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[m] ? f.severity : m), "info" as FinancialRedFlag["severity"]);
}

/** Whether a set of flags should escalate the item to attorney review. */
export function flagsNeedAttorney(flags: FinancialRedFlag[]): boolean {
  return flags.length > 0;
}

const GUIDANCE =
  "Full, honest disclosure is required by law — and it protects you. We can't prepare anything that hides, moves, or undervalues an asset: concealment in bankruptcy is a federal crime, transfers made to dodge creditors or a spouse get unwound, and hiding assets in a divorce draws court sanctions. If something here worries you, tell your attorney — there are almost always lawful options. We've flagged this for attorney review.";

export function redFlagGuidance(): string {
  return GUIDANCE;
}
