// ── Debt & debt-collection statutory registry ────────────────────────────────
//
// Source-cited catalog of the laws that decide most middle/lower-income debt
// matters — the federal Fair Debt Collection Practices Act (FDCPA) and Fair
// Credit Reporting Act (FCRA), the Texas Debt Collection Act (Fin. Code Ch. 392),
// Texas's strong debtor exemptions (wages, homestead, personal property), the
// 4-year limitations period on debt, and the bankruptcy automatic stay as the
// bridge into the bankruptcy tools.
//
// Mirrors lib/family-statutes.ts: every entry cites an official .gov source so
// intake and drafting GROUND on a real right instead of paraphrasing one. The
// model is constrained to these `key`s and must not invent a citation.
//
// General legal information, not legal advice. Summaries are high-level; the
// linked official text governs.

export type DebtCategory =
  | "fdcpa"
  | "fcra"
  | "tx-debt-collection"
  | "tx-exemptions"
  | "limitations"
  | "bankruptcy";

export interface DebtStatute {
  key: string;
  /** Formal citation, e.g. "15 U.S.C. § 1692g". */
  code: string;
  category: DebtCategory;
  /** "Federal" or "Texas". */
  jurisdiction: "Federal" | "Texas";
  topic: string;
  summary: string;
  /** What the law gives the consumer, in plain language. */
  consumer_right: string;
  /** A deadline or timing rule the consumer should watch, or null. */
  deadline: string | null;
  official_url: string;
  triggers: string[];
}

const FTC_FDCPA = "https://www.ftc.gov/legal-library/browse/rules/fair-debt-collection-practices-act-text";
const FTC_FCRA = "https://www.ftc.gov/legal-library/browse/statutes/fair-credit-reporting-act";
const TX_FI_392 = "https://statutes.capitol.texas.gov/Docs/FI/htm/FI.392.htm";
const TX_PR_41 = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.41.htm";
const TX_PR_42 = "https://statutes.capitol.texas.gov/Docs/PR/htm/PR.42.htm";
const TX_CP_16 = "https://statutes.capitol.texas.gov/Docs/CP/htm/CP.16.htm";
const US_COURTS_BK = "https://www.uscourts.gov/services-forms/bankruptcy/bankruptcy-basics";

export const DEBT_STATUTES: DebtStatute[] = [
  {
    key: "fdcpa-validation",
    code: "15 U.S.C. § 1692g",
    category: "fdcpa",
    jurisdiction: "Federal",
    topic: "Debt validation and the 30-day dispute right",
    summary:
      "Within five days of first contacting you, a debt collector must send a written notice stating the amount, the creditor, and your right to dispute. If you dispute the debt in writing within 30 days, the collector must stop collection until it mails you verification.",
    consumer_right:
      "You can demand written proof of a debt, and if you dispute it in writing within 30 days the collector must pause and verify it before collecting.",
    deadline: "Dispute in writing within 30 days of the collector's first written notice.",
    official_url: FTC_FDCPA,
    triggers: ["debt collector contacted me", "validation", "verify the debt", "prove I owe", "collection letter", "is this debt real"],
  },
  {
    key: "fdcpa-communication",
    code: "15 U.S.C. § 1692c",
    category: "fdcpa",
    jurisdiction: "Federal",
    topic: "Limits on collector communication; right to stop contact",
    summary:
      "A collector may not contact you at unusual or inconvenient times (generally before 8 a.m. or after 9 p.m.), at work if it knows your employer prohibits it, or after you tell it in writing to stop. It generally may not discuss your debt with third parties.",
    consumer_right:
      "You can tell a collector in writing to stop contacting you, and they can't call at odd hours, at work when barred, or talk about your debt with others.",
    deadline: null,
    official_url: FTC_FDCPA,
    triggers: ["stop calling", "calling me at work", "calling at night", "told them to stop", "talking to my family", "cease contact"],
  },
  {
    key: "fdcpa-harassment",
    code: "15 U.S.C. § 1692d",
    category: "fdcpa",
    jurisdiction: "Federal",
    topic: "Ban on harassment or abuse",
    summary:
      "A collector may not harass, oppress, or abuse you — including repeated or continuous calls intended to annoy, threats of violence, obscene language, or publishing a list of people who allegedly owe debts.",
    consumer_right: "Collectors cannot harass you with constant calls, threats, or abusive language.",
    deadline: null,
    official_url: FTC_FDCPA,
    triggers: ["harassment", "constant calls", "threatening me", "abusive", "calling over and over", "won't stop calling"],
  },
  {
    key: "fdcpa-false",
    code: "15 U.S.C. § 1692e",
    category: "fdcpa",
    jurisdiction: "Federal",
    topic: "Ban on false or misleading representations",
    summary:
      "A collector may not lie — for example, falsely threaten arrest or lawsuits it won't bring, misstate the amount owed, pose as a lawyer or government agency, or threaten to garnish wages it cannot lawfully reach.",
    consumer_right:
      "Collectors can't lie to you — no fake arrest threats, no inflated balances, no pretending to be a lawyer or the government.",
    deadline: null,
    official_url: FTC_FDCPA,
    triggers: ["threatened to arrest", "said I'll be sued", "threatened jail", "lied about", "pretending to be", "fake lawsuit threat"],
  },
  {
    key: "fdcpa-remedies",
    code: "15 U.S.C. § 1692k",
    category: "fdcpa",
    jurisdiction: "Federal",
    topic: "Your right to sue for violations",
    summary:
      "If a collector violates the FDCPA, you can sue within one year for your actual damages, statutory damages up to $1,000, plus court costs and reasonable attorney's fees.",
    consumer_right:
      "If a collector breaks the law, you can sue for up to $1,000 in statutory damages plus your costs and attorney's fees — often at no out-of-pocket cost to you.",
    deadline: "Sue within one year of the violation.",
    official_url: FTC_FDCPA,
    triggers: ["sue the collector", "fdcpa violation", "they broke the law", "statutory damages", "report the collector"],
  },
  {
    key: "fcra-disputes",
    code: "15 U.S.C. § 1681i",
    category: "fcra",
    jurisdiction: "Federal",
    topic: "Disputing errors on your credit report",
    summary:
      "If you dispute an item on your credit report, the credit bureau must conduct a reasonable reinvestigation (usually within 30 days) and correct or delete information it cannot verify. You are entitled to free annual reports.",
    consumer_right:
      "You can dispute wrong items on your credit report and the bureau must investigate and fix or delete what it can't verify — usually within 30 days.",
    deadline: "Bureau must generally complete its reinvestigation within 30 days of your dispute.",
    official_url: FTC_FCRA,
    triggers: ["credit report error", "wrong on my credit", "dispute credit", "inaccurate credit report", "remove from credit report", "not my account"],
  },
  {
    key: "tx-debt-collection-act",
    code: "Tex. Fin. Code Ch. 392",
    category: "tx-debt-collection",
    jurisdiction: "Texas",
    topic: "Texas Debt Collection Act",
    summary:
      "Texas's own debt-collection law bars threats, coercion, harassment, and fraudulent or deceptive collection methods by creditors and collectors, and ties violations to Deceptive Trade Practices Act remedies. It can apply to original creditors that the federal FDCPA does not.",
    consumer_right:
      "Texas law gives you a second layer of protection against abusive or deceptive collection — and it reaches some original creditors the federal law doesn't.",
    deadline: null,
    official_url: TX_FI_392,
    triggers: ["texas debt collection", "original creditor harassing", "deceptive collection", "texas collection law"],
  },
  {
    key: "tx-wage-exemption",
    code: "Tex. Prop. Code § 42.001; Tex. Const. art. XVI § 28",
    category: "tx-exemptions",
    jurisdiction: "Texas",
    topic: "Wages are exempt from garnishment for most debts",
    summary:
      "Texas does not allow wage garnishment for ordinary consumer debts (credit cards, medical bills, personal loans). Garnishment of current wages is allowed only for limited obligations like child/spousal support, taxes, and federal student loans.",
    consumer_right:
      "In Texas, your paycheck generally can't be garnished for credit cards, medical bills, or other ordinary debts — only special debts like child support or taxes.",
    deadline: null,
    official_url: TX_PR_42,
    triggers: ["garnish my wages", "garnishment", "take my paycheck", "wage garnishment", "can they garnish"],
  },
  {
    key: "tx-homestead",
    code: "Tex. Prop. Code Ch. 41",
    category: "tx-exemptions",
    jurisdiction: "Texas",
    topic: "Homestead exemption",
    summary:
      "Texas protects your homestead from forced sale by most creditors, with no dollar cap on value (subject to acreage limits — generally up to 10 urban or 100/200 rural acres). Mortgages, taxes, and certain liens are exceptions.",
    consumer_right:
      "Your home is strongly protected in Texas — most creditors cannot force its sale to pay an ordinary debt, regardless of its value.",
    deadline: null,
    official_url: TX_PR_41,
    triggers: ["lose my house", "take my home", "homestead", "lien on my house", "force sale of home"],
  },
  {
    key: "tx-personal-property",
    code: "Tex. Prop. Code Ch. 42",
    category: "tx-exemptions",
    jurisdiction: "Texas",
    topic: "Personal property exemptions",
    summary:
      "Texas exempts a generous package of personal property from creditors — up to $100,000 for a family (or $50,000 for a single adult) covering home furnishings, a car per licensed household member, tools of the trade, clothing, and more, plus certain retirement accounts and life insurance.",
    consumer_right:
      "A large set of your belongings — furniture, a vehicle, work tools, retirement accounts — is protected from creditors in Texas, up to $100k for a family ($50k single).",
    deadline: null,
    official_url: TX_PR_42,
    triggers: ["take my car", "take my stuff", "what can they take", "seize my property", "exempt property", "protect my belongings"],
  },
  {
    key: "tx-limitations-debt",
    code: "Tex. Civ. Prac. & Rem. Code § 16.004",
    category: "limitations",
    jurisdiction: "Texas",
    topic: "Four-year limitations period on debt",
    summary:
      "A suit on most debts (credit cards, contracts) must be brought within four years of the date the debt was last due. After that, the debt is 'time-barred' and the collector can't win a lawsuit on it — but making a payment or a written promise to pay can restart the clock.",
    consumer_right:
      "Most Texas debts can't be sued on after four years — but never make a payment or sign a promise on an old debt, because that can restart the four-year clock.",
    deadline: "Generally four years from the date the debt was last due.",
    official_url: TX_CP_16,
    triggers: ["old debt", "time barred", "statute of limitations", "too old to sue", "how long can they collect", "zombie debt", "re-aging"],
  },
  {
    key: "bankruptcy-automatic-stay",
    code: "11 U.S.C. § 362",
    category: "bankruptcy",
    jurisdiction: "Federal",
    topic: "The automatic stay",
    summary:
      "The moment a bankruptcy case is filed, an automatic stay stops most collection — calls, lawsuits, wage garnishment, bank levies, foreclosures, and repossessions — giving you immediate breathing room while the case proceeds.",
    consumer_right:
      "Filing bankruptcy instantly halts most collection — the calls, lawsuits, garnishments, and foreclosure stop the day you file.",
    deadline: null,
    official_url: US_COURTS_BK,
    triggers: ["stop foreclosure", "stop garnishment", "automatic stay", "filing bankruptcy stops", "buy time", "halt collection"],
  },
];

export type DebtStatuteKey = (typeof DEBT_STATUTES)[number]["key"];

const BY_KEY = new Map(DEBT_STATUTES.map((s) => [s.key, s]));

export function getDebtStatute(key: string): DebtStatute | undefined {
  return BY_KEY.get(key);
}

export function isKnownDebtStatuteKey(key: string): boolean {
  return BY_KEY.has(key);
}

/** Compact one-line-per-statute catalog for injection into a system prompt. */
export function debtStatutesForPrompt(): string {
  return DEBT_STATUTES.map(
    (s) =>
      `• ${s.key} — ${s.code} (${s.jurisdiction}): ${s.topic}. ${s.consumer_right}${
        s.deadline ? ` (Deadline: ${s.deadline})` : ""
      }`
  ).join("\n");
}

/** Offline keyword fallback: surface statutes whose triggers appear in free text. */
export function matchDebtStatutesByText(text: string): DebtStatute[] {
  const haystack = text.toLowerCase();
  return DEBT_STATUTES.filter((s) => s.triggers.some((t) => haystack.includes(t.toLowerCase())));
}
