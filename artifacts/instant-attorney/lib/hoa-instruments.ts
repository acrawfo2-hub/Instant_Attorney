// ── HOA instrument presets ────────────────────────────────────────────────────
//
// The documents an HOA dispute actually needs don't map cleanly onto a generic
// "demand letter." This catalog defines HOA-specific instruments as PRESETS over
// the existing wizard types (no new DocType / DB enum value, so it never disturbs
// the published document pipeline). Each preset carries the recipient guidance,
// required fields, response-deadline default, and the Texas statutes it leans on,
// so the drafter produces an HOA-shaped document instead of a generic one.
//
// `relevant_statutes` reference keys in lib/hoa-statutes.ts; a cross-check test
// asserts every referenced key resolves.

import type { WizardType } from "./types.ts";
import type { HoaStatuteKey } from "./hoa-statutes.ts";

export interface HoaInstrument {
  /** Stable identifier for the preset. */
  key: string;
  /** Human-readable label for menus and prompts. */
  label: string;
  /** What this instrument accomplishes for the homeowner. */
  purpose: string;
  /** Which existing wizard type drafts it. */
  wizard_type: WizardType;
  /** Who the document should be addressed to and copied on. */
  recipient_guidance: string;
  /** Fields the drafter should gather / confirm for this instrument. */
  required_fields: string[];
  /** Texas statute keys (lib/hoa-statutes.ts) this instrument relies on. */
  relevant_statutes: HoaStatuteKey[];
  /** Default response window to assert in the document, or null. */
  default_response_days: number | null;
  /** Natural-language situations that imply this instrument. */
  triggers: string[];
}

export const HOA_INSTRUMENTS: HoaInstrument[] = [
  {
    key: "violation_response",
    label: "Response to HOA Violation Notice / Request for Hearing",
    purpose:
      "Respond to a covenant-violation notice, contest the violation or assert a cure, and demand the statutory hearing before the board.",
    wizard_type: "general_document",
    recipient_guidance:
      "Address to the board of directors c/o the managing agent; copy the association's registered agent when fines or foreclosure are threatened.",
    required_fields: [
      "Owner full name and property address",
      "Association name and managing agent",
      "Violation notice date and described violation",
      "Whether the violation is disputed or being cured (and how/when)",
      "Express request for a hearing before the board",
    ],
    relevant_statutes: ["tx-209-notice-hearing"],
    default_response_days: 30,
    triggers: ["violation notice", "request a hearing", "contest a violation", "cure the violation"],
  },
  {
    key: "records_request",
    label: "HOA Books-and-Records Request",
    purpose:
      "Make a statutory written request to inspect and copy the association's books and records.",
    wizard_type: "general_document",
    recipient_guidance:
      "Address to the association c/o the managing agent at the address in the recorded management certificate.",
    required_fields: [
      "Owner full name and property address",
      "Association name",
      "Specific categories of records requested (financials, minutes, contracts, ledgers)",
      "Date range of records",
      "Whether inspection or copies are requested",
    ],
    relevant_statutes: ["tx-209-records"],
    default_response_days: 10,
    triggers: ["records request", "books and records", "want to see financials", "meeting minutes"],
  },
  {
    key: "fine_appeal",
    label: "Appeal / Dispute of HOA Fine or Assessment",
    purpose:
      "Dispute a levied fine or assessment, challenge how a payment was applied, and request correction of the ledger.",
    wizard_type: "general_document",
    recipient_guidance:
      "Address to the board c/o the managing agent; copy any third-party collector currently handling the account.",
    required_fields: [
      "Owner full name and property address",
      "Amount and date of the disputed fine/assessment",
      "Basis for the dispute (no notice, cured, selective enforcement, misapplied payment)",
      "Ledger/account statement reference",
      "Specific correction requested",
    ],
    relevant_statutes: ["tx-209-notice-hearing", "tx-209-priority-payments"],
    default_response_days: 30,
    triggers: ["dispute a fine", "wrong charge", "misapplied payment", "appeal an assessment"],
  },
  {
    key: "accommodation_request",
    label: "Reasonable Accommodation Request (Fair Housing)",
    purpose:
      "Request a reasonable accommodation or modification to a covenant or rule on the basis of disability under the Fair Housing Act.",
    wizard_type: "general_document",
    recipient_guidance:
      "Address to the board c/o the managing agent; mark as a Fair Housing Act reasonable-accommodation request.",
    required_fields: [
      "Owner/resident full name and property address",
      "Association name",
      "The rule or covenant at issue",
      "The accommodation or modification requested",
      "Nexus between the disability-related need and the request (without over-disclosing medical detail)",
    ],
    relevant_statutes: [],
    default_response_days: 14,
    triggers: ["reasonable accommodation", "service animal", "emotional support animal", "disability", "fair housing"],
  },
  {
    key: "architectural_appeal",
    label: "Architectural (ACC) Request or Denial Appeal",
    purpose:
      "Submit or appeal an architectural-control request (modification, improvement, solar, landscaping) and challenge an unreasonable denial.",
    wizard_type: "general_document",
    recipient_guidance:
      "Address to the architectural control committee c/o the managing agent; reference the governing-document approval procedure.",
    required_fields: [
      "Owner full name and property address",
      "Description of the proposed or denied modification",
      "Date and content of any ACC decision",
      "Governing-document section governing the approval process",
      "Why approval is warranted or the denial is unreasonable",
    ],
    relevant_statutes: ["tx-202-reasonable", "tx-202-solar"],
    default_response_days: 30,
    triggers: ["architectural request", "ACC denied", "modification denied", "improvement approval"],
  },
  {
    key: "payment_plan_request",
    label: "Request for Alternative Payment Schedule",
    purpose:
      "Request an installment payment plan for delinquent assessments under the association's payment-plan policy.",
    wizard_type: "general_document",
    recipient_guidance:
      "Address to the board c/o the managing agent before the account is referred to an attorney or collector.",
    required_fields: [
      "Owner full name and property address",
      "Total amount currently delinquent",
      "Proposed installment amount and schedule",
      "Reason a plan is needed",
    ],
    relevant_statutes: ["tx-209-payment-plan"],
    default_response_days: null,
    triggers: ["payment plan", "installments", "behind on dues", "can't pay all at once"],
  },
  {
    key: "selective_enforcement_demand",
    label: "Demand to Cease Selective Enforcement",
    purpose:
      "Demand that the association stop enforcing a covenant selectively or unreasonably against the owner.",
    wizard_type: "demand_letter",
    recipient_guidance:
      "Address to the board c/o the managing agent; copy the registered agent.",
    required_fields: [
      "Owner full name and property address",
      "The covenant being enforced",
      "Specific examples of comparable un-enforced violations",
      "Relief demanded (cease enforcement, withdraw fine)",
      "Response deadline",
    ],
    relevant_statutes: ["tx-202-reasonable"],
    default_response_days: 14,
    triggers: ["selective enforcement", "singled out", "neighbors not fined", "unequal enforcement"],
  },
  {
    key: "lien_foreclosure_response",
    label: "Response to Lien / Foreclosure Notice",
    purpose:
      "Respond to an assessment-lien or foreclosure notice, demand an itemized payoff, and assert statutory limits on foreclosure.",
    wizard_type: "general_document",
    recipient_guidance:
      "Address to the association and its foreclosure counsel; copy the registered agent. Time-sensitive.",
    required_fields: [
      "Owner full name and property address",
      "Date and content of the lien/foreclosure notice",
      "Itemized amount claimed (assessments vs. fines vs. fees)",
      "Any payment plan requested or tendered cure",
      "Demand for itemization and reservation of rights",
    ],
    relevant_statutes: ["tx-209-no-foreclose-fines", "tx-209-foreclosure-notice", "tx-209-priority-payments"],
    default_response_days: 14,
    triggers: ["lien", "foreclosure notice", "notice of sale", "payoff demand", "losing my home"],
  },
];

export type HoaInstrumentKey = (typeof HOA_INSTRUMENTS)[number]["key"];

const BY_KEY = new Map(HOA_INSTRUMENTS.map((i) => [i.key, i]));

export function getHoaInstrument(key: string): HoaInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownHoaInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact catalog for injection into the intake system prompt. */
export function hoaInstrumentsForPrompt(): string {
  return HOA_INSTRUMENTS.map(
    (i) => `• ${i.key} (drafts via ${i.wizard_type}) — ${i.label}: ${i.purpose}`
  ).join("\n");
}

/** Field-hint text for the drafter, shaped like WIZARD_FIELD_HINTS entries. */
export function hoaInstrumentFieldHint(key: string): string | null {
  const inst = BY_KEY.get(key);
  if (!inst) return null;
  const deadline =
    inst.default_response_days != null
      ? ` Assert a response deadline of about ${inst.default_response_days} days unless the file indicates otherwise.`
      : "";
  return `${inst.label}. ${inst.purpose} Recipient: ${inst.recipient_guidance} Required fields: ${inst.required_fields.join(
    "; "
  )}.${deadline}`;
}

/** Offline keyword fallback: surface instruments whose triggers appear in free text. */
export function matchHoaInstrumentsByText(text: string): HoaInstrument[] {
  const haystack = text.toLowerCase();
  return HOA_INSTRUMENTS.filter((i) =>
    i.triggers.some((t) => haystack.includes(t.toLowerCase()))
  );
}
