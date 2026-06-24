// ── Debt-collection rights & action items ────────────────────────────────────
//
// The middle/lower-income centerpiece: turn "a collector is after me and I don't
// know what to do" into a clear set of RIGHTS, concrete ACTION ITEMS, and the
// CAUTIONS that keep someone from accidentally making it worse (paying on a
// time-barred debt, ignoring a lawsuit). Pure data + lookups, fully testable; it
// references the debt statutes and instruments so the UI can link straight to the
// relevant right and the letter that asserts it.
//
// General legal information, not legal advice.

import type { DebtStatuteKey } from "./debt-statutes.ts";
import type { DebtInstrumentKey } from "./debt-instruments.ts";

export type DebtSituation =
  | "first_contact"
  | "being_sued"
  | "garnishment_threat"
  | "harassment"
  | "time_barred"
  | "not_my_debt"
  | "credit_report_error";

export interface ActionItem {
  step: string;
  why?: string;
  /** Time-critical step the user must not delay. */
  urgent?: boolean;
}

export interface RightsGuidance {
  situation: DebtSituation;
  label: string;
  /** One-line description for a menu. */
  blurb: string;
  /** Plain-language rights for this situation. */
  rights: string[];
  /** Concrete things the person can do, most important first. */
  actions: ActionItem[];
  /** Things NOT to do — the traps that make it worse. */
  cautions: string[];
  relevant_statutes: DebtStatuteKey[];
  relevant_instruments: DebtInstrumentKey[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is general legal information about your debt-collection rights, not legal advice. Deadlines and the right move depend on your specific facts — especially if you've been sued. Free help may be available from Texas legal aid (e.g. TexasLawHelp.org) and nonprofit credit counseling.";

// Ordered most-common / most-actionable first.
const GUIDANCE: Record<DebtSituation, Omit<RightsGuidance, "situation" | "disclaimer">> = {
  first_contact: {
    label: "A collector just contacted me",
    blurb: "You were contacted about a debt and want to respond the right way.",
    rights: [
      "Within five days of first contact, the collector must send written notice of the amount, the creditor, and your right to dispute.",
      "You can demand written validation of the debt and dispute it in writing within 30 days, which pauses collection until they verify it.",
    ],
    actions: [
      { step: "Send a written debt-validation request within 30 days of their first letter.", why: "Forces them to prove the debt is real, yours, and the right amount before collecting." },
      { step: "Keep every letter and a dated log of every call.", why: "Documentation is your evidence if they break the rules." },
      { step: "Confirm the debt is actually yours and the amount is right before doing anything else." },
    ],
    cautions: [
      "Don't admit the debt or promise to pay until it's validated — on an old debt, a payment or promise can restart the limitations clock.",
      "Don't give bank-account or payment information over the phone to an unverified caller.",
    ],
    relevant_statutes: ["fdcpa-validation", "fdcpa-communication"],
    relevant_instruments: ["debt_validation_request"],
  },
  being_sued: {
    label: "I've been sued over a debt",
    blurb: "You were served with a lawsuit or court papers about a debt.",
    rights: [
      "You have the right to answer the lawsuit and be heard, and to make the collector prove it owns the debt and the amount.",
      "You can raise defenses — including that the four-year limitations period has run.",
    ],
    actions: [
      { step: "File a written answer with the court by the deadline on the citation.", why: "Missing it lets them win automatically by default judgment.", urgent: true },
      { step: "Note the date you were served and calculate your answer deadline immediately.", urgent: true },
      { step: "Check whether the debt is time-barred (over four years since last due) and raise it as a defense if so." },
      { step: "Look for free help — Texas legal aid often assists with debt-defense, and many collectors can't prove they own the debt." },
    ],
    cautions: [
      "Do NOT ignore the lawsuit — a default judgment can lead to a bank-account levy or a lien even though Texas wages are usually protected.",
      "Don't assume you'll lose — collectors frequently lack the paperwork to prove the debt.",
    ],
    relevant_statutes: ["tx-limitations-debt", "tx-wage-exemption"],
    relevant_instruments: ["answer_to_debt_suit"],
  },
  garnishment_threat: {
    label: "They're threatening to take my wages or property",
    blurb: "A collector threatened garnishment, a bank levy, or seizing your property.",
    rights: [
      "In Texas, ordinary consumer debts cannot garnish your wages — only special debts like child support, taxes, or federal student loans can.",
      "A generous set of your property is exempt: your homestead (no value cap), a vehicle per driver, household goods, tools of your trade, and retirement accounts.",
    ],
    actions: [
      { step: "Know which of your income and property is exempt before you react." },
      { step: "If the threat is about wage garnishment for a credit card or medical bill, recognize it usually can't happen in Texas — and a false threat can itself violate the law." },
      { step: "Respond to any actual lawsuit; a judgment is what can reach a non-exempt bank account." },
    ],
    cautions: [
      "Don't drain or move money to dodge creditors in ways that look fraudulent — that can backfire.",
      "A threat to garnish wages it can't lawfully reach may be an FDCPA violation worth documenting.",
    ],
    relevant_statutes: ["tx-wage-exemption", "tx-homestead", "tx-personal-property", "fdcpa-false"],
    relevant_instruments: ["harassment_demand", "cfpb_oag_complaint"],
  },
  harassment: {
    label: "A collector is harassing me",
    blurb: "Constant calls, threats, calls at work or odd hours, or talking to others about your debt.",
    rights: [
      "Collectors can't harass or abuse you, can't call before 8 a.m. or after 9 p.m., can't call you at work if told to stop, and generally can't discuss your debt with third parties.",
      "If a collector violates the law, you can sue within one year for up to $1,000 in statutory damages plus your costs and attorney's fees.",
    ],
    actions: [
      { step: "Tell the collector in writing to stop contacting you (cease-communication letter).", why: "After that, they may only contact you to confirm they'll stop or that they're suing." },
      { step: "Keep a dated log of every call and contact — time, number, and what was said." },
      { step: "File a complaint with the CFPB and/or the Texas Attorney General." },
      { step: "Consider an FDCPA suit — these are often handled at no out-of-pocket cost because the law shifts fees to the collector." },
    ],
    cautions: [
      "A cease-communication letter doesn't erase the debt and may make a lawsuit more likely — weigh that.",
      "Check your state's recording laws before recording calls.",
    ],
    relevant_statutes: ["fdcpa-harassment", "fdcpa-communication", "fdcpa-false", "fdcpa-remedies", "tx-debt-collection-act"],
    relevant_instruments: ["cease_communication_letter", "harassment_demand", "cfpb_oag_complaint"],
  },
  time_barred: {
    label: "This debt is really old",
    blurb: "An old debt has resurfaced and you're not sure if it can still be collected.",
    rights: [
      "Most Texas debts can't be sued on after four years from when they were last due — they become 'time-barred.'",
      "Suing or threatening to sue on a debt the collector knows is time-barred can itself violate the law.",
    ],
    actions: [
      { step: "Figure out the date of your last payment or default — that starts the four-year clock." },
      { step: "If it's past four years, you can tell the collector in writing that the debt is time-barred and disputed." },
      { step: "If they sue anyway, raise the statute of limitations as a defense in your answer." },
    ],
    cautions: [
      "Do NOT make a payment, set up a plan, or sign anything admitting the debt — any of these can restart the four-year clock on an otherwise-dead debt.",
      "Time-barred doesn't mean erased — it can still appear on credit reports for up to seven years.",
    ],
    relevant_statutes: ["tx-limitations-debt"],
    relevant_instruments: ["statute_of_limitations_letter", "answer_to_debt_suit"],
  },
  not_my_debt: {
    label: "This isn't my debt (or it's already paid)",
    blurb: "You're being pursued for a debt that isn't yours, is paid, or stems from identity theft.",
    rights: [
      "You can demand validation and dispute a debt that isn't yours.",
      "If it's identity theft, you have added protections to block the account and remove it from your credit report.",
    ],
    actions: [
      { step: "Send a written validation request disputing that the debt is yours." },
      { step: "Dispute the item with each credit bureau in writing, with proof." },
      { step: "If it's identity theft, file a report at the FTC's IdentityTheft.gov and consider a police report." },
    ],
    cautions: [
      "Don't pay 'just to make it go away' — paying can be treated as admitting it's yours.",
      "Keep copies of everything you send and proof of mailing.",
    ],
    relevant_statutes: ["fdcpa-validation", "fcra-disputes"],
    relevant_instruments: ["debt_validation_request", "credit_report_dispute"],
  },
  credit_report_error: {
    label: "There's a mistake on my credit report",
    blurb: "An inaccurate account or balance is hurting your credit.",
    rights: [
      "You can dispute inaccurate items and the credit bureau must reinvestigate, usually within 30 days, and delete what it can't verify.",
      "You're entitled to free credit reports to check for errors.",
    ],
    actions: [
      { step: "Get your reports (free at annualcreditreport.com) and identify every inaccurate item." },
      { step: "Dispute each error in writing with the credit bureau reporting it, attaching documentation." },
      { step: "If the bureau won't fix a verified error, escalate with a complaint to the CFPB." },
    ],
    cautions: [
      "Disputing online can waive some rights — a mailed, documented dispute creates a stronger record.",
      "Keep proof of mailing and copies of everything.",
    ],
    relevant_statutes: ["fcra-disputes"],
    relevant_instruments: ["credit_report_dispute"],
  },
};

const ORDER: DebtSituation[] = [
  "first_contact",
  "being_sued",
  "garnishment_threat",
  "harassment",
  "time_barred",
  "not_my_debt",
  "credit_report_error",
];

/** All situations, in menu order, with label + blurb for a picker. */
export const DEBT_SITUATIONS = ORDER.map((situation) => ({
  situation,
  label: GUIDANCE[situation].label,
  blurb: GUIDANCE[situation].blurb,
}));

export function isKnownDebtSituation(s: string): s is DebtSituation {
  return s in GUIDANCE;
}

/** Full rights guidance for a situation. */
export function debtRightsFor(situation: DebtSituation): RightsGuidance {
  const g = GUIDANCE[situation];
  return { situation, disclaimer: DISCLAIMER, ...g };
}

// Keyword → situation, most-urgent first so e.g. "sued" wins over a generic "debt".
const SITUATION_TRIGGERS: Array<[DebtSituation, string[]]> = [
  ["being_sued", ["sued", "lawsuit", "served", "court papers", "citation", "summons", "default judgment"]],
  ["garnishment_threat", ["garnish", "garnishment", "take my wages", "levy", "take my paycheck", "seize", "take my car", "take my house"]],
  ["harassment", ["harass", "calling constantly", "won't stop calling", "threatening", "calls at work", "abusive", "calling at night"]],
  ["time_barred", ["old debt", "time barred", "statute of limitations", "too old", "zombie debt", "years ago"]],
  ["not_my_debt", ["not my debt", "isn't mine", "already paid", "identity theft", "wrong person"]],
  ["credit_report_error", ["credit report", "credit score", "inaccurate", "remove from my credit"]],
  ["first_contact", ["collector contacted", "got a collection", "collection letter", "first contact", "debt collector"]],
];

/** Best-guess situation from free text, or null if nothing matches. */
export function matchDebtSituation(text: string | null | undefined): DebtSituation | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  for (const [situation, terms] of SITUATION_TRIGGERS) {
    if (terms.some((t) => haystack.includes(t))) return situation;
  }
  return null;
}
