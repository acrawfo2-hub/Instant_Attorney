// ── Federal tax-law statutory registry ───────────────────────────────────────
//
// Source-cited catalog of the laws that decide most middle-class tax *legal*
// problems — IRS notices, collection rights, audits, innocent spouse relief,
// penalty abatement, and identity theft. This is NOT tax return preparation;
// it grounds intake and drafting on real rights when tax problems become legal
// problems.
//
// Mirrors lib/debt-statutes.ts: every entry cites an official .gov source so
// intake and drafting GROUND on a real right instead of paraphrasing one.
//
// General legal information, not legal advice. Summaries are high-level; the
// linked official text governs.

export type TaxCategory =
  | "notices"
  | "collection"
  | "audit"
  | "relief"
  | "penalties"
  | "identity";

export interface TaxStatute {
  key: string;
  /** Formal citation, e.g. "26 U.S.C. § 6330". */
  code: string;
  category: TaxCategory;
  /** "Federal" (state tax entries can be added later). */
  jurisdiction: "Federal";
  topic: string;
  summary: string;
  /** What the law gives the taxpayer, in plain language. */
  taxpayer_right: string;
  /** A deadline or timing rule the taxpayer should watch, or null. */
  deadline: string | null;
  official_url: string;
  triggers: string[];
}

const IRS_TBOR = "https://www.irs.gov/taxpayers/taxpayer-bill-of-rights";
const IRS_NOTICES = "https://www.irs.gov/individuals/understanding-your-irs-notice-or-letter";
const IRS_CDP = "https://www.irs.gov/businesses/small-businesses-self-employed/collection-due-process";
const IRS_AUDIT = "https://www.irs.gov/businesses/small-businesses-self-employed/irs-audits";
const IRS_INNOCENT_SPOUSE = "https://www.irs.gov/individuals/innocent-spouse-relief";
const IRS_INSTALLMENT = "https://www.irs.gov/payments/payment-plans-installment-agreements";
const IRS_OIC = "https://www.irs.gov/payments/offer-in-compromise";
const IRS_PENALTY = "https://www.irs.gov/payments/penalty-relief";
const IRS_ID_THEFT = "https://www.irs.gov/identity-theft-fraud-scams";
const USC_26_6502 = "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section6502&num=0&edition=prelim";
const USC_26_6015 = "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section6015&num=0&edition=prelim";
const USC_26_7602 = "https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title26-section7602&num=0&edition=prelim";

export const TAX_STATUTES: TaxStatute[] = [
  {
    key: "irs-notice-response",
    code: "IRS Notice Procedures",
    category: "notices",
    jurisdiction: "Federal",
    topic: "Your right to understand and respond to an IRS notice",
    summary:
      "An IRS notice is not a final bill — it explains what the IRS believes and what you can do. Most notices give a deadline to respond or agree/disagree. Ignoring a notice usually makes things worse (more penalties, faster collection).",
    taxpayer_right:
      "You can read the notice, gather your records, and respond by the deadline — agreeing, disagreeing, or asking for more time. You are not required to pay immediately just because you received a letter.",
    deadline: "Each notice states its own response deadline — often 30 or 60 days.",
    official_url: IRS_NOTICES,
    triggers: ["irs notice", "got a letter", "cp2000", "cp501", "cp504", "lt11", "notice of deficiency", "math error"],
  },
  {
    key: "irc-collection-statute",
    code: "26 U.S.C. § 6502",
    category: "collection",
    jurisdiction: "Federal",
    topic: "How long the IRS can collect a tax debt",
    summary:
      "Generally, the IRS has ten years from assessment to collect a tax debt. After that, the debt may become uncollectible — but the clock can be extended by certain events (offers in compromise, bankruptcy, collection due process hearings, and more).",
    taxpayer_right:
      "Collection does not last forever — there is a statutory limit, and knowing when the debt was assessed can matter for your strategy.",
    deadline: "Generally ten years from assessment, subject to extensions.",
    official_url: USC_26_6502,
    triggers: ["how long can irs collect", "statute of limitations", "old tax debt", "ten year", "collection expired"],
  },
  {
    key: "irs-cdp-rights",
    code: "26 U.S.C. § 6330",
    category: "collection",
    jurisdiction: "Federal",
    topic: "Collection Due Process — appeal before levy",
    summary:
      "Before the IRS levies your wages or bank account (after certain notices), you generally have the right to request a Collection Due Process (CDP) hearing with the IRS Independent Office of Appeals — and, if you disagree with the result, to petition the U.S. Tax Court within 30 days.",
    taxpayer_right:
      "You can request a CDP hearing to challenge collection and propose alternatives (installment agreement, currently not collectible, offer in compromise) before a levy takes effect.",
    deadline: "Request a CDP hearing within 30 days of the date on a Final Notice of Intent to Levy (e.g., LT11/L1058).",
    official_url: IRS_CDP,
    triggers: ["final notice", "intent to levy", "lt11", "l1058", "cdp hearing", "collection due process", "appeal levy"],
  },
  {
    key: "irs-levy-limits",
    code: "26 U.S.C. §§ 6334, 6331",
    category: "collection",
    jurisdiction: "Federal",
    topic: "Levy restrictions and exempt amounts",
    summary:
      "The IRS can levy wages and bank accounts, but certain property is exempt and wage levies leave you a minimum amount to live on. A levy is serious — but you have rights to challenge it and seek release.",
    taxpayer_right:
      "Not all of your income and property can be taken; wage levies must leave an exempt amount, and you can seek levy release when paying creates a hardship or the levy was improper.",
    deadline: null,
    official_url: IRS_CDP,
    triggers: ["wage garnishment", "bank levy", "irs took my money", "levy", "garnish my paycheck"],
  },
  {
    key: "irs-audit-rights",
    code: "26 U.S.C. § 7602",
    category: "audit",
    jurisdiction: "Federal",
    topic: "Your rights during an IRS examination",
    summary:
      "An audit (examination) is the IRS checking whether your return is correct. You have the right to representation, to know why the IRS is asking for information, and to appeal many proposed changes. You do not have to face the IRS alone.",
    taxpayer_right:
      "You can hire representation, respond with documentation, and appeal a proposed adjustment. You should not ignore an audit letter or examination request.",
    deadline: "Audit and examination letters state response deadlines — missing them can lead to a deficiency without your input.",
    official_url: IRS_AUDIT,
    triggers: ["audit", "examination", "irs wants records", "revenue agent", "cp75", "under audit"],
  },
  {
    key: "irs-taxpayer-bill-of-rights",
    code: "Taxpayer Bill of Rights",
    category: "audit",
    jurisdiction: "Federal",
    topic: "Fundamental taxpayer rights",
    summary:
      "The IRS recognizes ten fundamental rights: among them, the right to be informed, to quality service, to pay no more than the correct amount of tax, to challenge the IRS's position and be heard, to appeal, to finality, to privacy, to confidentiality, to representation, and to a fair and just tax system.",
    taxpayer_right:
      "You are entitled to clear explanations, professional treatment, representation, and meaningful appeal rights — not just a demand to pay.",
    deadline: null,
    official_url: IRS_TBOR,
    triggers: ["my rights", "taxpayer bill of rights", "fair treatment", "representation"],
  },
  {
    key: "irc-innocent-spouse",
    code: "26 U.S.C. § 6015",
    category: "relief",
    jurisdiction: "Federal",
    topic: "Innocent spouse relief",
    summary:
      "If you filed a joint return and your spouse (or ex-spouse) understated tax without your knowledge, you may qualify for innocent spouse relief so you are not held liable for their understatement — if you meet the statutory requirements.",
    taxpayer_right:
      "You may be able to separate your liability from a spouse's or ex-spouse's understatement on a joint return, but the rules are strict and timing matters.",
    deadline: "Generally request relief within two years of the IRS's first collection attempt for the liability — earlier is better.",
    official_url: IRS_INNOCENT_SPOUSE,
    triggers: ["innocent spouse", "ex spouse taxes", "joint return", "not my tax", "spouse lied"],
  },
  {
    key: "irs-installment-agreement",
    code: "26 U.S.C. § 6159",
    category: "collection",
    jurisdiction: "Federal",
    topic: "Paying over time — installment agreements",
    summary:
      "If you cannot pay in full, you may qualify for an installment agreement to pay the IRS over time. Short-term and long-term plans exist; setup depends on how much you owe and your financial situation.",
    taxpayer_right:
      "You can propose a monthly payment plan instead of paying everything at once — but interest and penalties generally continue until the balance is paid.",
    deadline: null,
    official_url: IRS_INSTALLMENT,
    triggers: ["payment plan", "installment agreement", "pay over time", "can't pay in full", "monthly payment"],
  },
  {
    key: "irs-offer-in-compromise",
    code: "26 U.S.C. § 7122",
    category: "collection",
    jurisdiction: "Federal",
    topic: "Offer in compromise — settling for less than full amount",
    summary:
      "In limited cases where the IRS doubts it can collect the full amount or where full payment would create economic hardship, you may be able to settle the debt for less through an Offer in Compromise. This is not available to everyone and requires detailed financial disclosure.",
    taxpayer_right:
      "You may be able to settle tax debt for less than the full amount if you qualify — but approval is discretionary and the process is intensive.",
    deadline: null,
    official_url: IRS_OIC,
    triggers: ["offer in compromise", "settle taxes", "pay less than I owe", "oic", "compromise"],
  },
  {
    key: "irs-penalty-abatement",
    code: "IRC Penalty Relief",
    category: "penalties",
    jurisdiction: "Federal",
    topic: "Penalty relief — first-time abatement and reasonable cause",
    summary:
      "The IRS may reduce or remove penalties for failure to file, failure to pay, or accuracy-related issues if you have reasonable cause or qualify for first-time penalty abatement (for certain penalties if you have a clean compliance history).",
    taxpayer_right:
      "Penalties are not always final — you can request abatement based on reasonable cause or, in some cases, first-time relief.",
    deadline: null,
    official_url: IRS_PENALTY,
    triggers: ["penalty", "penalties", "abatement", "reasonable cause", "first time penalty"],
  },
  {
    key: "irs-identity-theft",
    code: "IRS Identity Theft Procedures",
    category: "identity",
    jurisdiction: "Federal",
    topic: "Tax-related identity theft",
    summary:
      "If someone files a fraudulent return using your SSN or you receive IRS notices about income you did not earn, the IRS has identity-theft procedures — including Form 14039 and an Identity Protection PIN program for confirmed victims.",
    taxpayer_right:
      "You can report tax identity theft, flag your account, and work with the IRS to clear fraudulent returns — but you must act promptly and keep records.",
    deadline: "Report suspected identity theft as soon as you discover it.",
    official_url: IRS_ID_THEFT,
    triggers: ["identity theft", "fraudulent return", "someone filed taxes", "ip pin", "14039", "stolen ssn"],
  },
];

export type TaxStatuteKey = (typeof TAX_STATUTES)[number]["key"];

const BY_KEY = new Map(TAX_STATUTES.map((s) => [s.key, s]));

export function getTaxStatute(key: string): TaxStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownTaxStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function taxStatutesForPrompt(): string {
  return TAX_STATUTES.map(
    (s) =>
      `• ${s.key} — ${s.code} (${s.jurisdiction}): ${s.topic}. ${s.taxpayer_right}${
        s.deadline ? ` (Deadline: ${s.deadline})` : ""
      }`
  ).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchTaxStatutesByText(text: string): TaxStatute[] {
  const haystack = text.toLowerCase();
  return TAX_STATUTES.filter((s) => s.triggers.some((t) => haystack.includes(t.toLowerCase())));
}
