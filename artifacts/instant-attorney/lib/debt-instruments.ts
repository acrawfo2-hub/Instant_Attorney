// ── Debt & debt-collection instrument presets ────────────────────────────────
//
// The documents a debt matter actually needs — validation requests, cease-contact
// letters, credit disputes, an answer to a collection lawsuit — don't map cleanly
// onto a generic letter. This catalog defines them as PRESETS over the existing
// wizard types (no new DocType / DB enum), so it never disturbs the published
// document pipeline. Mirrors lib/family-instruments.ts.
//
// `relevant_statutes` reference keys in lib/debt-statutes.ts; a cross-check test
// asserts every referenced key resolves.

import type { WizardType } from "./types.ts";
import { matchDebtStatutesByText, type DebtStatuteKey } from "./debt-statutes.ts";

export interface DebtInstrument {
  key: string;
  label: string;
  purpose: string;
  wizard_type: WizardType;
  recipient_guidance: string;
  required_fields: string[];
  relevant_statutes: DebtStatuteKey[];
  default_response_days: number | null;
  /** True for time-critical / high-stakes instruments (e.g. answering a lawsuit). */
  high_stakes: boolean;
  triggers: string[];
}

export const DEBT_INSTRUMENTS: DebtInstrument[] = [
  {
    key: "debt_validation_request",
    label: "Debt Validation Request",
    purpose:
      "Demand that a collector verify a debt (amount, original creditor, your liability) and pause collection, using the FDCPA 30-day dispute right.",
    wizard_type: "general_document",
    recipient_guidance:
      "Send to the collection agency at the address on their notice, by mail with proof of mailing (certified mail recommended). Send within 30 days of their first written notice.",
    required_fields: [
      "Your name and address",
      "Collector name and address; account/reference number",
      "The date of the collector's first written notice (to stay inside the 30-day window)",
      "A clear statement disputing the debt and requesting validation",
    ],
    relevant_statutes: ["fdcpa-validation"],
    default_response_days: 30,
    high_stakes: false,
    triggers: ["validate the debt", "verify the debt", "prove I owe", "is this debt mine", "dispute the debt"],
  },
  {
    key: "cease_communication_letter",
    label: "Cease-Communication Letter",
    purpose:
      "Tell a collector in writing to stop contacting you, as the FDCPA allows (they may then contact you only to confirm they'll stop or to say they're suing).",
    wizard_type: "general_document",
    recipient_guidance:
      "Send to the collector by mail with proof of mailing. Note that stopping contact does not erase the debt and may make a lawsuit more likely, so weigh it.",
    required_fields: [
      "Your name and address",
      "Collector name and address; account/reference number",
      "A clear instruction to cease all further communication",
    ],
    relevant_statutes: ["fdcpa-communication"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["stop contacting me", "cease communication", "make them stop calling", "stop the calls"],
  },
  {
    key: "harassment_demand",
    label: "Demand to Stop Harassment (FDCPA / Texas DCA)",
    purpose:
      "Demand a collector stop harassing, abusive, or deceptive conduct, document the violations, and reserve your right to sue or complain.",
    wizard_type: "demand_letter",
    recipient_guidance:
      "Send to the collector; keep a dated log of every call/contact (time, number, what was said) as evidence.",
    required_fields: [
      "Your name and address",
      "Collector name and address",
      "Specific conduct complained of (dates/times of calls, threats, third-party contact)",
      "Demand that the conduct stop and reservation of FDCPA / Texas DCA claims",
    ],
    relevant_statutes: ["fdcpa-harassment", "fdcpa-false", "fdcpa-communication", "tx-debt-collection-act"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["harassment", "threatening me", "calling constantly", "abusive collector", "they lied"],
  },
  {
    key: "credit_report_dispute",
    label: "Credit-Report Dispute Letter",
    purpose:
      "Dispute an inaccurate item with a credit bureau under the FCRA and require a reinvestigation, with documentation attached.",
    wizard_type: "general_document",
    recipient_guidance:
      "Send to each credit bureau reporting the error (Equifax, Experian, TransUnion) by mail with proof of mailing; attach supporting documents.",
    required_fields: [
      "Your name, address, and date of birth",
      "The specific item(s) disputed and why they are inaccurate",
      "The bureau being written to",
      "List of documents enclosed as proof",
    ],
    relevant_statutes: ["fcra-disputes"],
    default_response_days: 30,
    high_stakes: false,
    triggers: ["dispute credit report", "credit report wrong", "remove from credit report", "inaccurate account", "identity theft credit"],
  },
  {
    key: "answer_to_debt_suit",
    label: "Answer to a Debt-Collection Lawsuit",
    purpose:
      "File a timely answer to a debt lawsuit — entering a general denial and raising defenses (limitations / standing / lack of proof) — to avoid a default judgment.",
    wizard_type: "general_document",
    recipient_guidance:
      "File with the court named in the citation by the deadline stated there, and serve a copy on the plaintiff's attorney. TIME-CRITICAL — missing the deadline forfeits the case.",
    required_fields: [
      "Your name and the cause number, court, and county from the citation",
      "Plaintiff (collector/creditor) name",
      "Date you were served (to compute the answer deadline)",
      "General denial and any defenses (statute of limitations, not the debtor, no proof of ownership)",
    ],
    relevant_statutes: ["tx-limitations-debt"],
    default_response_days: 14,
    high_stakes: true,
    triggers: ["being sued", "served with a lawsuit", "debt lawsuit", "court papers", "citation", "respond to the lawsuit", "default judgment"],
  },
  {
    key: "statute_of_limitations_letter",
    label: "Time-Barred Debt (Statute-of-Limitations) Letter",
    purpose:
      "Notify a collector that a debt is outside the four-year limitations period and that you dispute it and will not pay, without admitting the debt or restarting the clock.",
    wizard_type: "general_document",
    recipient_guidance:
      "Send to the collector by mail. Carefully avoid any language acknowledging the debt or promising payment, which can restart the limitations period.",
    required_fields: [
      "Your name and address",
      "Collector name and address; account/reference number",
      "The approximate date of last payment / default (to show the 4-year period has run)",
      "A statement that the debt is time-barred and disputed",
    ],
    relevant_statutes: ["tx-limitations-debt"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["old debt", "time barred", "statute of limitations", "too old", "zombie debt", "past the limit"],
  },
  {
    key: "debt_settlement_proposal",
    label: "Debt Settlement / Payment-Plan Proposal",
    purpose:
      "Propose, in writing, a lump-sum settlement or installment plan to resolve a debt — with terms (amount, 'paid in full' / deletion language) stated before any money changes hands.",
    wizard_type: "general_document",
    recipient_guidance:
      "Send to the current creditor or collector. Get any agreement in writing BEFORE paying; specify how the account will be reported once paid.",
    required_fields: [
      "Your name and account/reference number",
      "Creditor/collector name",
      "Proposed settlement amount or installment schedule",
      "Requested terms on completion (account marked satisfied; reporting treatment)",
    ],
    relevant_statutes: ["tx-debt-collection-act"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["settle the debt", "payment plan", "negotiate", "lump sum", "pay less than I owe", "settlement offer"],
  },
  {
    key: "cfpb_oag_complaint",
    label: "Complaint to the CFPB / Texas Attorney General",
    purpose:
      "File a regulatory complaint against an abusive or deceptive collector with the Consumer Financial Protection Bureau and/or the Texas Attorney General.",
    wizard_type: "complaint_letter",
    recipient_guidance:
      "Submit to the CFPB (consumerfinance.gov/complaint) and/or the Texas Attorney General consumer protection division; attach your call log and any letters.",
    required_fields: [
      "Your name and contact information",
      "Collector name and address",
      "Chronological description of the violations with dates",
      "Documents/evidence (call log, letters, recordings if lawful)",
      "Relief requested",
    ],
    relevant_statutes: ["fdcpa-harassment", "fdcpa-false", "fdcpa-remedies", "tx-debt-collection-act"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["report the collector", "file a complaint", "cfpb", "attorney general complaint", "report harassment"],
  },
];

export type DebtInstrumentKey = (typeof DEBT_INSTRUMENTS)[number]["key"];

const BY_KEY = new Map(DEBT_INSTRUMENTS.map((i) => [i.key, i]));

export function getDebtInstrument(key: string): DebtInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownDebtInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact catalog for injection into the intake system prompt. */
export function debtInstrumentsForPrompt(): string {
  return DEBT_INSTRUMENTS.map(
    (i) =>
      `• ${i.key} (drafts via ${i.wizard_type})${i.high_stakes ? " [HIGH-STAKES — time-critical, recommend consult]" : ""} — ${i.label}: ${i.purpose}`
  ).join("\n");
}

/** Field-hint text for the drafter, shaped like WIZARD_FIELD_HINTS entries. */
export function debtInstrumentFieldHint(key: string): string | null {
  const inst = BY_KEY.get(key);
  if (!inst) return null;
  const deadline =
    inst.default_response_days != null
      ? ` Assert / honor a response deadline of about ${inst.default_response_days} days unless the file indicates otherwise.`
      : "";
  return `${inst.label}. ${inst.purpose} Recipient: ${inst.recipient_guidance} Required fields: ${inst.required_fields.join(
    "; "
  )}.${deadline}`;
}

/** Offline keyword fallback: surface instruments whose triggers appear in free text. */
export function matchDebtInstrumentsByText(text: string): DebtInstrument[] {
  const haystack = text.toLowerCase();
  return DEBT_INSTRUMENTS.filter((i) => i.triggers.some((t) => haystack.includes(t.toLowerCase())));
}

// Short, single-concept terms a debt matter is described by, so a terse
// matter_subtype like "debt" or "collections" is detected even though the
// instrument/statute triggers are multi-word phrases (same gap looksLikeFamilyMatter closes).
const DEBT_CORE_TERMS = [
  "debt",
  "collector",
  "collection",
  "creditor",
  "garnish",
  "garnishment",
  "credit report",
  "credit card debt",
  "medical debt",
  "bankruptcy",
  "being sued",
  "judgment",
  "repossession",
  "foreclosure",
  "settlement",
  "charge-off",
  "charged off",
];

/**
 * Whether free text (e.g. a case's matter subtype + summary) looks like a debt /
 * debt-collection matter. Combines core terms with the instrument and statute
 * keyword matchers so both terse subtypes and richer summaries are caught.
 */
export function looksLikeDebtMatter(text: string | null | undefined): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  if (DEBT_CORE_TERMS.some((t) => haystack.includes(t))) return true;
  if (matchDebtInstrumentsByText(haystack).length > 0) return true;
  return matchDebtStatutesByText(haystack).length > 0;
}
