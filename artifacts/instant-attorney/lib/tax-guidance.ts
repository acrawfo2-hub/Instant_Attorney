// ── Tax problem navigator — rights & action items ────────────────────────────
//
// The middle-class centerpiece for tax *legal* problems: turn "I got a letter
// from the IRS and I don't know what to do" into a clear set of RIGHTS,
// concrete ACTION ITEMS, and CAUTIONS. This is NOT tax return preparation —
// it does not compute liability or walk through Form 1040.
//
// Pure data + lookups, fully testable; references tax statutes and instruments
// so the UI can link to the relevant right and the letter that asserts it.
//
// General legal information, not legal advice.

import type { TaxStatuteKey } from "./tax-statutes.ts";
import type { TaxInstrumentKey } from "./tax-instruments.ts";

export type TaxSituation =
  | "irs_notice"
  | "behind_on_taxes"
  | "audit"
  | "levy_threat"
  | "innocent_spouse"
  | "tax_identity_theft";

export interface ActionItem {
  step: string;
  why?: string;
  /** Time-critical step the user must not delay. */
  urgent?: boolean;
}

export interface TaxGuidance {
  situation: TaxSituation;
  label: string;
  /** One-line description for a menu. */
  blurb: string;
  /** Plain-language rights for this situation. */
  rights: string[];
  /** Concrete things the person can do, most important first. */
  actions: ActionItem[];
  /** Things NOT to do — the traps that make it worse. */
  cautions: string[];
  relevant_statutes: TaxStatuteKey[];
  relevant_instruments: TaxInstrumentKey[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is general legal information about your tax rights, not legal advice — and it does not prepare or file your tax return. For return preparation, use tax software or a CPA. For your specific situation, especially audits, levies, or large balances, consult a tax attorney. Low-income taxpayers may qualify for help through the IRS Taxpayer Advocate Service or a Low Income Taxpayer Clinic.";

const GUIDANCE: Record<TaxSituation, Omit<TaxGuidance, "situation" | "disclaimer">> = {
  irs_notice: {
    label: "I got a letter from the IRS",
    blurb: "You received an IRS notice and want to understand what it means and what to do.",
    rights: [
      "An IRS notice is not a final bill — it explains what the IRS believes and what you can do next.",
      "You generally have a stated deadline to respond, agree, disagree, or request more time.",
      "You have the right to be informed, to challenge the IRS's position, and to representation.",
    ],
    actions: [
      { step: "Read the notice carefully — note the notice number (e.g., CP2000, CP501), tax year, amount, and the response deadline.", why: "Missing the deadline often leads to more penalties and faster collection.", urgent: true },
      { step: "Compare the notice to your records (W-2s, 1099s, prior returns) before agreeing to anything." },
      { step: "Respond in writing by the deadline — agreeing, partially agreeing, or disagreeing with an explanation.", why: "Silence is usually treated as agreement or allows the IRS to move forward without your input." },
      { step: "If you disagree or need more time, say so in your response and ask for an extension if needed." },
      { step: "Consider authorizing a tax attorney or enrolled agent to represent you if the amount is large or the issue is complex." },
    ],
    cautions: [
      "Do NOT ignore the notice — penalties and interest keep running, and collection can escalate.",
      "Do NOT agree to pay just because you're scared — verify the amount is correct first.",
      "Do NOT post your full SSN, bank account numbers, or detailed financial records on unprotected channels.",
    ],
    relevant_statutes: ["irs-notice-response", "irs-taxpayer-bill-of-rights"],
    relevant_instruments: ["irs_notice_response", "power_of_attorney_irs"],
  },
  behind_on_taxes: {
    label: "I owe back taxes and can't pay in full",
    blurb: "You have a tax balance you cannot pay all at once and want to know your options.",
    rights: [
      "You may qualify for an installment agreement to pay over time instead of all at once.",
      "If you truly cannot pay anything, you may be placed in Currently Not Collectible status while your financial situation is dire.",
      "In limited cases, you may be able to settle for less through an Offer in Compromise — but approval is not guaranteed.",
      "The IRS generally cannot collect forever — there is a statutory collection period (usually ten years from assessment).",
    ],
    actions: [
      { step: "File any unfiled returns — the IRS generally will not approve a payment plan until you are in compliance.", why: "Unfiled returns block most collection alternatives.", urgent: true },
      { step: "Review whether penalties can be abated (reasonable cause or first-time abatement if you qualify)." },
      { step: "If you can pay something monthly, propose a realistic installment agreement you can actually maintain." },
      { step: "If you cannot pay anything without hardship, document your income and necessary expenses for a Currently Not Collectible request." },
      { step: "Talk to a tax attorney before an Offer in Compromise — it is complex, requires full financial disclosure, and is often denied." },
    ],
    cautions: [
      "Do NOT borrow against retirement accounts or take high-interest loans without understanding the trade-offs.",
      "Do NOT assume an Offer in Compromise is easy — most taxpayers do not qualify.",
      "Interest and penalties generally continue during an installment agreement until the balance is paid.",
    ],
    relevant_statutes: ["irs-installment-agreement", "irs-offer-in-compromise", "irc-collection-statute", "irs-penalty-abatement"],
    relevant_instruments: ["installment_agreement_request", "penalty_abatement_request", "offer_in_compromise_inquiry", "power_of_attorney_irs"],
  },
  audit: {
    label: "The IRS is auditing or examining me",
    blurb: "You received an audit letter or the IRS is asking for records.",
    rights: [
      "You have the right to know why the IRS is examining your return and what information it needs.",
      "You can hire representation — you do not have to face the IRS alone.",
      "You can appeal many proposed adjustments through IRS Appeals and, in some cases, the U.S. Tax Court.",
    ],
    actions: [
      { step: "Note every deadline on the audit letter and calendar them immediately.", urgent: true },
      { step: "Gather the specific documents the IRS requested — do not volunteer records beyond what was asked." },
      { step: "Consider hiring a tax attorney or enrolled agent before your first substantive response, especially for business income, large deductions, or crypto." },
      { step: "Respond in writing with organized documentation; keep copies of everything you send." },
      { step: "If you disagree with a proposed adjustment, understand your appeal rights before agreeing." },
    ],
    cautions: [
      "Do NOT ignore an audit letter — the IRS can propose a deficiency without your input.",
      "Do NOT lie, guess, or reconstruct records you do not have — that can turn a civil issue into a criminal one.",
      "Do NOT sign an agreement to pay more tax without understanding what you are conceding.",
    ],
    relevant_statutes: ["irs-audit-rights", "irs-taxpayer-bill-of-rights"],
    relevant_instruments: ["power_of_attorney_irs", "irs_notice_response"],
  },
  levy_threat: {
    label: "They're threatening to levy my wages or bank account",
    blurb: "You received a Final Notice of Intent to Levy or the IRS has already taken money.",
    rights: [
      "Before most levies, you generally have the right to request a Collection Due Process (CDP) hearing within 30 days of a Final Notice.",
      "Wage levies must leave you a minimum exempt amount to live on; some property is protected.",
      "You can seek levy release if the levy creates a hardship or was improper.",
    ],
    actions: [
      { step: "If you received a Final Notice (e.g., LT11/L1058), request a CDP hearing within 30 days if you want to challenge collection or propose an alternative.", why: "Missing the 30-day window usually forfeits CDP rights for that notice.", urgent: true },
      { step: "Propose a collection alternative in your CDP request — installment agreement, Currently Not Collectible, or (if appropriate) an Offer in Compromise." },
      { step: "If a levy is already in place and causing hardship, request release and document your necessary living expenses." },
      { step: "Get representation — levies are one of the highest-stakes moments in tax collection." },
    ],
    cautions: [
      "Do NOT ignore a Final Notice — after the CDP window, the IRS can levy without further warning in many cases.",
      "Do NOT drain accounts in ways that look like hiding assets — that can make things worse.",
      "Bankruptcy may discharge some tax debts but not all — get advice before filing primarily for tax reasons.",
    ],
    relevant_statutes: ["irs-cdp-rights", "irs-levy-limits", "irc-collection-statute"],
    relevant_instruments: ["collection_due_process_request", "installment_agreement_request", "power_of_attorney_irs"],
  },
  innocent_spouse: {
    label: "My spouse (or ex) caused the tax problem on our joint return",
    blurb: "You filed jointly and believe you should not be held liable for your spouse's understatement.",
    rights: [
      "Innocent spouse relief under IRC § 6015 may separate your liability from a spouse's understatement — if you meet strict requirements.",
      "Separate relief types exist (innocent spouse, separation of liability, equitable relief) with different fact patterns.",
      "Timing matters — relief is generally requested within two years of the IRS's first collection attempt for the liability.",
    ],
    actions: [
      { step: "Gather your divorce decree (if any), financial records, and evidence you did not know about the understatement." },
      { step: "Identify which type of relief fits your facts — innocent spouse, separation of liability, or equitable relief." },
      { step: "File Form 8857 (or a detailed written request) with a clear narrative of what you knew and when." },
      { step: "Consult a tax attorney — innocent spouse cases are fact-intensive and often contested." },
    ],
    cautions: [
      "Do NOT assume filing separately for other years fixes a joint-return year — joint filing binds both spouses unless relief is granted.",
      "Do NOT wait — the two-year window from first collection activity can bar relief.",
      "If you benefited from the unreported income or erroneous deductions, relief may be harder or unavailable.",
    ],
    relevant_statutes: ["irc-innocent-spouse"],
    relevant_instruments: ["innocent_spouse_relief_request", "power_of_attorney_irs"],
  },
  tax_identity_theft: {
    label: "Someone filed taxes using my identity",
    blurb: "You learned a fraudulent return was filed with your SSN or you got IRS notices for income you didn't earn.",
    rights: [
      "You can report tax identity theft to the IRS and flag your account.",
      "Confirmed victims may receive an Identity Protection PIN to file future returns securely.",
      "You are not liable for tax on income you did not earn — but you must work through the IRS identity-theft process.",
    ],
    actions: [
      { step: "File an IRS Identity Theft Affidavit (Form 14039) and follow IRS identity-theft instructions.", urgent: true },
      { step: "Report at IdentityTheft.gov and consider a local police report for your records." },
      { step: "Respond to any IRS notices explaining the fraudulent return — do not ignore them." },
      { step: "Do not e-file your legitimate return until the IRS clears the fraudulent one (you may need to paper-file)." },
      { step: "Place fraud alerts or credit freezes with the credit bureaus if broader identity theft is suspected." },
    ],
    cautions: [
      "Do NOT ignore IRS notices about income you did not earn — silence can delay resolution for years.",
      "Do NOT share your SSN or identity documents over unsecured channels.",
      "Be wary of 'IRS' phone scams — the IRS generally contacts you by mail first, not by threatening immediate arrest.",
    ],
    relevant_statutes: ["irs-identity-theft", "irs-notice-response"],
    relevant_instruments: ["identity_theft_affidavit", "irs_notice_response"],
  },
};

const ORDER: TaxSituation[] = [
  "irs_notice",
  "levy_threat",
  "behind_on_taxes",
  "audit",
  "innocent_spouse",
  "tax_identity_theft",
];

/** All situations, in menu order, with label + blurb for a picker. */
export const TAX_SITUATIONS = ORDER.map((situation) => ({
  situation,
  label: GUIDANCE[situation].label,
  blurb: GUIDANCE[situation].blurb,
}));

export function isKnownTaxSituation(s: string): s is TaxSituation {
  return s in GUIDANCE;
}

/** Full tax guidance for a situation. */
export function taxGuidanceFor(situation: TaxSituation): TaxGuidance {
  const g = GUIDANCE[situation];
  return { situation, disclaimer: DISCLAIMER, ...g };
}

// Keyword → situation, most-urgent first.
const SITUATION_TRIGGERS: Array<[TaxSituation, string[]]> = [
  ["levy_threat", ["levy", "garnish", "final notice", "intent to levy", "lt11", "took my money", "bank account"]],
  ["tax_identity_theft", ["identity theft", "fraudulent return", "someone filed", "stolen ssn", "not my income"]],
  ["audit", ["audit", "examination", "irs wants records", "revenue agent", "under audit"]],
  ["innocent_spouse", ["innocent spouse", "ex spouse", "joint return", "not my tax", "spouse lied"]],
  ["behind_on_taxes", ["back taxes", "can't pay", "owe the irs", "payment plan", "installment", "offer in compromise"]],
  ["irs_notice", ["irs notice", "got a letter", "cp2000", "cp501", "cp504", "notice from irs"]],
];

/** Best-guess situation from free text, or null if nothing matches. */
export function matchTaxSituation(text: string | null | undefined): TaxSituation | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  for (const [situation, terms] of SITUATION_TRIGGERS) {
    if (terms.some((t) => haystack.includes(t))) return situation;
  }
  return null;
}
