// ── Tax controversy instrument presets ───────────────────────────────────────
//
// The documents a tax *legal* matter actually needs — notice responses, CDP
// requests, installment proposals, innocent spouse relief, identity-theft
// affidavits — mapped as PRESETS over existing wizard types. This is NOT tax
// return preparation.
//
// `relevant_statutes` reference keys in lib/tax-statutes.ts; a cross-check test
// asserts every referenced key resolves.

import type { WizardType } from "./types.ts";
import { matchTaxStatutesByText, type TaxStatuteKey } from "./tax-statutes.ts";

export interface TaxInstrument {
  key: string;
  label: string;
  purpose: string;
  wizard_type: WizardType;
  recipient_guidance: string;
  required_fields: string[];
  relevant_statutes: TaxStatuteKey[];
  default_response_days: number | null;
  /** True for time-critical / high-stakes instruments. */
  high_stakes: boolean;
  triggers: string[];
}

export const TAX_INSTRUMENTS: TaxInstrument[] = [
  {
    key: "irs_notice_response",
    label: "IRS Notice Response Letter",
    purpose:
      "Respond in writing to an IRS notice — agreeing, disagreeing, or requesting more time — with a clear explanation and supporting facts.",
    wizard_type: "general_document",
    recipient_guidance:
      "Mail to the IRS address on the notice (or fax if the notice allows). Keep proof of mailing. Use the notice number, tax year, and your taxpayer identification on every page.",
    required_fields: [
      "Your name, address, and taxpayer identification number",
      "Notice number, tax year, and date of the IRS letter",
      "Whether you agree, partially agree, or disagree",
      "Explanation with specific facts and any supporting documents referenced",
    ],
    relevant_statutes: ["irs-notice-response"],
    default_response_days: 30,
    high_stakes: false,
    triggers: ["respond to notice", "cp2000", "disagree with irs", "irs letter"],
  },
  {
    key: "collection_due_process_request",
    label: "Collection Due Process Hearing Request",
    purpose:
      "Request a CDP hearing within 30 days of a Final Notice of Intent to Levy to challenge collection and propose alternatives before a levy.",
    wizard_type: "general_document",
    recipient_guidance:
      "File using Form 12153 (or equivalent written request) at the address on the Final Notice. The 30-day deadline is strict — missing it usually forfeits CDP rights for that notice.",
    required_fields: [
      "Your name, address, and taxpayer identification number",
      "Tax periods and amounts at issue",
      "Date of the Final Notice of Intent to Levy",
      "Proposed collection alternative (installment agreement, CNC, OIC, etc.)",
      "Reasons collection should not proceed or should be modified",
    ],
    relevant_statutes: ["irs-cdp-rights", "irs-levy-limits"],
    default_response_days: 30,
    high_stakes: true,
    triggers: ["cdp hearing", "final notice", "intent to levy", "appeal levy", "lt11"],
  },
  {
    key: "installment_agreement_request",
    label: "Installment Agreement Request",
    purpose:
      "Propose a monthly payment plan when you cannot pay the full balance immediately.",
    wizard_type: "general_document",
    recipient_guidance:
      "Submit via IRS online payment agreement tool when eligible, or mail Form 9465 with your proposal. Be realistic — the IRS expects a plan you can actually maintain.",
    required_fields: [
      "Your name, address, and taxpayer identification number",
      "Tax periods and total amount owed",
      "Proposed monthly payment amount",
      "Brief summary of income and necessary expenses supporting the proposal",
    ],
    relevant_statutes: ["irs-installment-agreement"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["payment plan", "installment agreement", "pay over time", "monthly payment"],
  },
  {
    key: "offer_in_compromise_inquiry",
    label: "Offer in Compromise — Preliminary Inquiry",
    purpose:
      "Frame a preliminary request or inquiry about settling tax debt for less than the full amount — a complex, disclosure-heavy process that usually needs professional help.",
    wizard_type: "general_document",
    recipient_guidance:
      "An OIC requires Form 656 plus detailed financial disclosures (433-A/OIC). Recommend a tax attorney or enrolled agent before filing — approval is discretionary and mistakes can delay relief.",
    required_fields: [
      "Your name, address, and taxpayer identification number",
      "Tax periods and approximate balance",
      "Why full payment would cause economic hardship or why collection is doubtful",
      "Summary of assets, income, and necessary living expenses",
    ],
    relevant_statutes: ["irs-offer-in-compromise"],
    default_response_days: null,
    high_stakes: true,
    triggers: ["offer in compromise", "settle taxes", "oic", "pay less than I owe"],
  },
  {
    key: "innocent_spouse_relief_request",
    label: "Innocent Spouse Relief Request",
    purpose:
      "Request relief from liability for a spouse's or ex-spouse's understatement on a joint return under IRC § 6015.",
    wizard_type: "general_document",
    recipient_guidance:
      "File Form 8857 (or a detailed written request) with the IRS. Timing and facts matter — gather divorce decrees, financial records, and evidence you did not know about the understatement.",
    required_fields: [
      "Your name, address, and taxpayer identification number",
      "Tax year(s) and understatement at issue",
      "Your relationship to the other spouse at the time of filing",
      "Facts showing you did not know and had no reason to know of the understatement",
      "Whether you benefited from the unreported income or erroneous deductions",
    ],
    relevant_statutes: ["irc-innocent-spouse"],
    default_response_days: null,
    high_stakes: true,
    triggers: ["innocent spouse", "ex spouse taxes", "joint return", "not my tax"],
  },
  {
    key: "identity_theft_affidavit",
    label: "Identity Theft Affidavit (Form 14039)",
    purpose:
      "Report to the IRS that someone filed a fraudulent return or used your identity for tax purposes.",
    wizard_type: "general_document",
    recipient_guidance:
      "Complete IRS Form 14039 and mail or fax per IRS identity-theft instructions. Also file at IdentityTheft.gov and consider a police report. Do not e-file your real return until the IRS clears the fraudulent one.",
    required_fields: [
      "Your name, address, and taxpayer identification number",
      "Tax year of the fraudulent return",
      "Description of how you discovered the identity theft",
      "Any IRS notice numbers received",
    ],
    relevant_statutes: ["irs-identity-theft"],
    default_response_days: null,
    high_stakes: true,
    triggers: ["identity theft", "fraudulent return", "someone filed taxes", "14039"],
  },
  {
    key: "penalty_abatement_request",
    label: "Penalty Abatement Request",
    purpose:
      "Ask the IRS to reduce or remove penalties based on reasonable cause or first-time penalty abatement eligibility.",
    wizard_type: "general_document",
    recipient_guidance:
      "Write to the IRS office on your notice or call to request abatement. Explain the specific reasonable cause (illness, disaster, reliance on a professional, etc.) with documentation.",
    required_fields: [
      "Your name, address, and taxpayer identification number",
      "Tax year and penalty type (failure to file, failure to pay, accuracy-related)",
      "Facts supporting reasonable cause or first-time abatement eligibility",
      "Supporting documentation referenced",
    ],
    relevant_statutes: ["irs-penalty-abatement"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["penalty abatement", "remove penalty", "reasonable cause", "first time penalty"],
  },
  {
    key: "power_of_attorney_irs",
    label: "IRS Power of Attorney (Form 2848)",
    purpose:
      "Authorize a tax attorney, CPA, or enrolled agent to represent you before the IRS on specified matters.",
    wizard_type: "general_document",
    recipient_guidance:
      "Complete IRS Form 2848 with your representative's information and the tax matters/years covered. Your representative signs and files with the IRS.",
    required_fields: [
      "Your name, address, and taxpayer identification number",
      "Representative name, address, CAF number, and designation (attorney, CPA, EA)",
      "Tax matters and years covered",
      "Acts authorized (receive notices, represent at exam, appeals, etc.)",
    ],
    relevant_statutes: ["irs-taxpayer-bill-of-rights", "irs-audit-rights"],
    default_response_days: null,
    high_stakes: false,
    triggers: ["power of attorney", "represent me", "2848", "hire a tax attorney"],
  },
];

export type TaxInstrumentKey = (typeof TAX_INSTRUMENTS)[number]["key"];

const BY_KEY = new Map(TAX_INSTRUMENTS.map((i) => [i.key, i]));

export function getTaxInstrument(key: string): TaxInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownTaxInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact catalog for injection into the intake system prompt. */
export function taxInstrumentsForPrompt(): string {
  return TAX_INSTRUMENTS.map(
    (i) =>
      `• ${i.key} (drafts via ${i.wizard_type})${i.high_stakes ? " [HIGH-STAKES — time-critical, recommend consult]" : ""} — ${i.label}: ${i.purpose}`
  ).join("\n");
}

/** Field-hint text for the drafter, shaped like WIZARD_FIELD_HINTS entries. */
export function taxInstrumentFieldHint(key: string): string | null {
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
export function matchTaxInstrumentsByText(text: string): TaxInstrument[] {
  const haystack = text.toLowerCase();
  return TAX_INSTRUMENTS.filter((i) => i.triggers.some((t) => haystack.includes(t.toLowerCase())));
}

const TAX_CORE_TERMS = [
  "irs",
  "tax debt",
  "back taxes",
  "tax notice",
  "tax audit",
  "innocent spouse",
  "tax levy",
  "tax garnishment",
  "offer in compromise",
  "cp2000",
  "tax identity theft",
];

/**
 * Whether free text looks like a tax controversy / collection matter (not return prep).
 */
export function looksLikeTaxMatter(text: string | null | undefined): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  if (TAX_CORE_TERMS.some((t) => haystack.includes(t))) return true;
  if (matchTaxInstrumentsByText(haystack).length > 0) return true;
  return matchTaxStatutesByText(haystack).length > 0;
}
