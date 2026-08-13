// ── Property-lien instrument presets ──────────────────────────────────────────
//
// Documents a Texas property-lien dispute actually needs — responses to
// mechanic's liens, foreclosure notices, payoff/release demands, title-defect
// letters — as PRESETS over existing instrument types (no new DocType / DB enum).
// Mirrors lib/hoa-instruments.ts and lib/debt-instruments.ts.
//
// `relevant_statutes` reference keys in lib/lien-statutes.ts; a cross-check test
// asserts every referenced key resolves.

import type { InstrumentType } from "./types.ts";
import { matchLienStatutesByText, type LienStatuteKey } from "./lien-statutes.ts";

export interface LienInstrument {
  key: string;
  label: string;
  purpose: string;
  engine: InstrumentType;
  recipient_guidance: string;
  required_fields: string[];
  relevant_statutes: LienStatuteKey[];
  default_response_days: number | null;
  /** True for time-critical / high-stakes instruments (foreclosure, sale date set). */
  high_stakes: boolean;
  triggers: string[];
}

export const LIEN_INSTRUMENTS: LienInstrument[] = [
  {
    key: "mechanics_lien_response",
    label: "Response to Mechanic's / Materialman's Lien",
    purpose:
      "Respond to a recorded lien affidavit — dispute the amount, challenge notice/filing defects, demand itemization, and reserve rights while title is clouded.",
    engine: "general_document",
    recipient_guidance:
      "Address to the lien claimant and their counsel; copy the county clerk's recording information and the general contractor if applicable.",
    required_fields: [
      "Owner name and property address (legal description if known)",
      "Lien claimant name; recording date and county instrument number",
      "Amount claimed and work period stated on the affidavit",
      "Specific defects alleged (late filing, missing preliminary notice, wrong amount, work not authorized)",
      "Demand for itemized accounting and reservation of rights",
    ],
    relevant_statutes: [
      "tx-53-right-to-lien",
      "tx-53-preliminary-notice",
      "tx-53-lien-filing-deadline",
      "tx-53-residential-notice",
    ],
    default_response_days: 14,
    high_stakes: false,
    triggers: [
      "mechanic's lien",
      "mechanics lien",
      "lien affidavit",
      "contractor recorded a lien",
      "supplier lien",
    ],
  },
  {
    key: "lien_bond_demand",
    label: "Demand to Bond Off / Discharge Mechanic's Lien",
    purpose:
      "Demand that a lien claimant accept a transfer bond (or notify of intent to post one) to remove the lien from county records while the dispute continues.",
    engine: "demand_letter",
    recipient_guidance:
      "Address to the lien claimant and their attorney; time-sensitive if a sale or refinance is pending.",
    required_fields: [
      "Owner name and property address",
      "Lien recording information (county, date, instrument number)",
      "Amount of lien being bonded",
      "Closing/refinance date driving urgency (if any)",
      "Statement of intent to post statutory transfer bond if claimant will not stipulate to discharge",
    ],
    relevant_statutes: ["tx-53-bond-to-remove", "tx-53-release-duty"],
    default_response_days: 10,
    high_stakes: false,
    triggers: [
      "bond off lien",
      "discharge lien",
      "remove lien from title",
      "lien blocking sale",
      "can't refinance",
    ],
  },
  {
    key: "lien_release_demand",
    label: "Demand for Lien Release After Payment",
    purpose:
      "Demand that a lien claimant file a release of lien in the county records after payment, settlement, or satisfaction of the underlying debt.",
    engine: "demand_letter",
    recipient_guidance:
      "Address to the lien claimant; attach proof of payment (canceled check, settlement agreement, or closing statement).",
    required_fields: [
      "Owner name and property address",
      "Lien claimant name; recording information",
      "Date and amount paid or settlement terms",
      "Proof of payment enclosed",
      "Demand to file release within statutory period; reservation of damages for refusal",
    ],
    relevant_statutes: ["tx-53-release-duty"],
    default_response_days: 10,
    high_stakes: false,
    triggers: [
      "lien release",
      "paid but lien still showing",
      "won't release lien",
      "clear title after payment",
    ],
  },
  {
    key: "mortgage_foreclosure_response",
    label: "Response to Mortgage Foreclosure / Notice of Sale [HIGH-STAKES]",
    purpose:
      "Respond to a deed-of-trust default or notice of sale — request reinstatement/payoff figures, assert notice defects, and reserve defenses before the trustee's sale.",
    engine: "general_document",
    recipient_guidance:
      "Address to the loan servicer and the trustee named in the deed of trust; send certified mail before the sale date.",
    required_fields: [
      "Borrower name and property address",
      "Loan servicer and trustee names/addresses",
      "Dates of default notice and notice of sale; scheduled sale date",
      "Amount demanded to reinstate or pay off (if known)",
      "Specific defects or disputes (wrong amount, insurance/escrow errors, loss-mitigation request pending)",
      "Demand for written payoff/reinstatement figure and suspension of sale pending review",
    ],
    relevant_statutes: [
      "tx-51-security-instrument",
      "tx-51-foreclosure-notice",
      "tx-51-cure-right",
      "tx-41-homestead-shield",
    ],
    default_response_days: null,
    high_stakes: true,
    triggers: [
      "foreclosure",
      "notice of sale",
      "trustee sale",
      "behind on mortgage",
      "save my house",
      "foreclosure sale date",
    ],
  },
  {
    key: "payoff_demand_letter",
    label: "Written Payoff / Reinstatement Demand",
    purpose:
      "Demand a formal written payoff or reinstatement figure from a lienholder (mortgage servicer, judgment creditor, or tax authority) with per-diem interest and recording fees.",
    engine: "general_document",
    recipient_guidance:
      "Address to the lienholder or servicer loss-mitigation/payoff department; request the figure in writing good through a stated date.",
    required_fields: [
      "Owner/borrower name and property address",
      "Lienholder/servicer name and loan or account number",
      "Type of lien (mortgage, judgment, tax, mechanic's)",
      "Purpose (reinstatement, full payoff, sale closing)",
      "Requested good-through date for the figure",
    ],
    relevant_statutes: ["tx-51-cure-right", "tx-52-judgment-lien", "tx-53-release-duty"],
    default_response_days: 7,
    high_stakes: false,
    triggers: [
      "payoff amount",
      "reinstatement figure",
      "how much to stop foreclosure",
      "payoff demand",
      "good through date",
    ],
  },
  {
    key: "title_encumbrance_demand",
    label: "Demand to Clear Title Defect / Encumbrance",
    purpose:
      "Demand that a seller, prior owner, lien claimant, or title company party clear an exception on a title commitment so a sale or refinance can close.",
    engine: "demand_letter",
    recipient_guidance:
      "Address to the party who can cure (seller, prior owner, claimant, or their counsel); copy the title company and buyer/lender as appropriate.",
    required_fields: [
      "Property address and legal description",
      "Title commitment date and Schedule B exception language",
      "Nature of the encumbrance (old lien, judgment, easement, unreleased deed of trust)",
      "Closing date driving urgency",
      "Specific cure demanded (release, payoff, indemnity, or bond)",
    ],
    relevant_statutes: ["tx-title-recording", "tx-52-judgment-lien", "tx-53-release-duty"],
    default_response_days: 10,
    high_stakes: false,
    triggers: [
      "title exception",
      "title defect",
      "cloud on title",
      "can't close",
      "encumbrance",
      "schedule b",
    ],
  },
  {
    key: "judgment_lien_homestead_challenge",
    label: "Challenge to Judgment Lien on Homestead",
    purpose:
      "Assert homestead protection against a judgment lien on the owner's primary residence and demand withdrawal or subordination of the abstract of judgment as to the homestead.",
    engine: "general_document",
    recipient_guidance:
      "Address to the judgment creditor or their attorney; cite homestead designation and the nature of the underlying debt.",
    required_fields: [
      "Owner name and homestead property address",
      "Judgment creditor name; judgment and abstract recording information",
      "Nature of underlying debt (credit card, medical, etc.)",
      "Statement that property is the owner's homestead",
      "Demand to release or disclaim lien as to homestead; reservation of remedies",
    ],
    relevant_statutes: ["tx-52-homestead-exception", "tx-41-homestead-shield", "tx-52-judgment-lien"],
    default_response_days: 14,
    high_stakes: false,
    triggers: [
      "judgment lien on my house",
      "homestead judgment",
      "abstract of judgment on home",
      "judgment on homestead",
    ],
  },
  {
    key: "tax_lien_response",
    label: "Response to Property Tax Delinquency / Tax Foreclosure Notice [HIGH-STAKES]",
    purpose:
      "Respond to a delinquent property-tax notice or tax suit — request an itemized breakdown, assert errors, and preserve rights before a tax foreclosure.",
    engine: "general_document",
    recipient_guidance:
      "Address to the county tax assessor-collector or their attorney; time-sensitive if a tax suit or sale is scheduled.",
    required_fields: [
      "Owner name and property address",
      "Taxing unit and account number",
      "Tax years and amounts claimed delinquent",
      "Specific disputes (wrong owner, exemption denied, payment credited elsewhere)",
      "Request for payment plan or hearing if available",
    ],
    relevant_statutes: ["tx-state-tax-lien", "tx-41-permitted-liens"],
    default_response_days: null,
    high_stakes: true,
    triggers: [
      "property tax foreclosure",
      "delinquent property taxes",
      "tax lien on house",
      "tax suit",
      "owed property taxes",
    ],
  },
];

export type LienInstrumentKey = (typeof LIEN_INSTRUMENTS)[number]["key"];

const BY_KEY = new Map(LIEN_INSTRUMENTS.map((i) => [i.key, i]));

const LIEN_CORE_TERMS = [
  "lien",
  "encumbrance",
  "foreclosure",
  "mechanic",
  "mechanics",
  "materialman",
  "title commitment",
  "title exception",
  "notice of sale",
  "deed of trust",
  "abstract of judgment",
  "tax lien",
];

export function getLienInstrument(key: string): LienInstrument | undefined {
  return BY_KEY.get(key);
}

export function isKnownLienInstrumentKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact catalog for injection into the intake system prompt. */
export function lienInstrumentsForPrompt(): string {
  return LIEN_INSTRUMENTS.map((i) => {
    const stakes = i.high_stakes ? " [HIGH-STAKES]" : "";
    return `• ${i.key} (drafts via ${i.engine})${stakes} — ${i.label}: ${i.purpose}`;
  }).join("\n");
}

/** Field-hint text for the drafter, shaped like INSTRUMENT_FIELD_HINTS entries. */
export function lienInstrumentFieldHint(key: string): string | null {
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
export function matchLienInstrumentsByText(text: string): LienInstrument[] {
  const haystack = text.toLowerCase();
  return LIEN_INSTRUMENTS.filter((i) =>
    i.triggers.some((t) => haystack.includes(t.toLowerCase()))
  );
}

/** Detect property-lien matters from subtype/summary text. HOA liens route to HOA module. */
export function looksLikeLienMatter(text: string | null | undefined): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  // HOA assessment liens are handled by the HOA module.
  if (/hoa|homeowner.*association|condo.*association|assessment lien/.test(haystack)) return false;
  if (LIEN_CORE_TERMS.some((t) => haystack.includes(t))) return true;
  return matchLienStatutesByText(text).length > 0 || matchLienInstrumentsByText(text).length > 0;
}
