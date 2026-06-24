// ── Debt-relief options helper ───────────────────────────────────────────────
//
// "Should I even file bankruptcy, and which kind?" For a middle/lower-income
// person this is mostly a thinking problem, not a math problem. This module lays
// out the realistic paths — Chapter 7, Chapter 13, negotiate/settle, the
// judgment-proof "do nothing" reality, and a nonprofit debt-management plan —
// each with when it fits and what to watch for, and tags each path against a few
// simple signals so the strongest options float up.
//
// Pure data + lookup, fully testable. General legal information, not legal advice.

import type { DebtStatuteKey } from "./debt-statutes.ts";
import type { DebtInstrumentKey } from "./debt-instruments.ts";

export type DebtOptionKey =
  | "chapter_7"
  | "chapter_13"
  | "negotiate_settle"
  | "judgment_proof"
  | "debt_management_plan";

export type Fit = "strong" | "possible" | "unlikely";

export interface DebtOption {
  key: DebtOptionKey;
  label: string;
  summary: string;
  bestWhen: string[];
  watchOut: string[];
  relevant_statutes: DebtStatuteKey[];
  relevant_instruments: DebtInstrumentKey[];
}

export interface OptionSignals {
  /** Means-test median screen result, if known. */
  belowMedian?: boolean;
  /** Steady, predictable income (needed for a Chapter 13 plan). */
  regularIncome?: boolean;
  /** Behind on a house or car payment and wants to keep it. */
  behindOnSecuredWantKeep?: boolean;
  /** Assets are essentially all within Texas exemptions. */
  assetsMostlyExempt?: boolean;
  /** Received a Chapter 7 discharge within the last 8 years (bars another). */
  priorCh7Within8yr?: boolean;
  /** Has some lump sum available to settle. */
  hasLumpSumToSettle?: boolean;
}

export interface RankedOption extends DebtOption {
  fit: Fit;
  reason: string;
}

const OPTIONS: Record<DebtOptionKey, DebtOption> = {
  chapter_7: {
    key: "chapter_7",
    label: "Chapter 7 (liquidation)",
    summary:
      "Wipes out most unsecured debt (credit cards, medical bills, personal loans) in about 3–4 months. In Texas, the generous exemptions mean most people keep everything they own.",
    bestWhen: [
      "Your income is at or below the Texas median (or you pass the full means test).",
      "Your property fits within the Texas exemptions, so there's nothing for the trustee to sell.",
      "Your debt is mostly the dischargeable kind (not recent taxes, support, or most student loans).",
    ],
    watchOut: [
      "Non-exempt assets can be sold — though Texas exemptions protect most people's property.",
      "It does not cure missed mortgage/car payments to let you keep something you're behind on.",
      "After a Chapter 7 discharge you can't get another for 8 years.",
    ],
    relevant_statutes: ["bankruptcy-automatic-stay", "tx-homestead", "tx-personal-property"],
    relevant_instruments: [],
  },
  chapter_13: {
    key: "chapter_13",
    label: "Chapter 13 (repayment plan)",
    summary:
      "A 3–5 year court-supervised plan to catch up on debts from your income. It lets you cure missed house/car payments and keep the property, and works when income is too high for Chapter 7.",
    bestWhen: [
      "You're behind on a mortgage or car and want to keep it — Chapter 13 lets you catch up over time.",
      "Your income is above the median, so Chapter 7 isn't available on income alone.",
      "You have steady income to fund a plan and want to protect non-exempt assets.",
    ],
    watchOut: [
      "It requires regular, predictable income.",
      "You make plan payments for 3–5 years before the remaining balance is discharged.",
      "The plan must be confirmed by the court and kept current.",
    ],
    relevant_statutes: ["bankruptcy-automatic-stay"],
    relevant_instruments: [],
  },
  negotiate_settle: {
    key: "negotiate_settle",
    label: "Negotiate or settle (no bankruptcy)",
    summary:
      "Settle debts for less than the full balance or set up a payment plan directly with creditors — avoiding a bankruptcy filing entirely.",
    bestWhen: [
      "You have a small number of debts and some money to offer as a lump sum.",
      "You'd prefer to avoid filing if you can.",
    ],
    watchOut: [
      "Collectors don't have to agree, and this won't stop a determined one.",
      "Forgiven debt can be treated as taxable income.",
      "Get every agreement in writing BEFORE you pay anything.",
    ],
    relevant_statutes: ["tx-debt-collection-act"],
    relevant_instruments: ["debt_settlement_proposal"],
  },
  judgment_proof: {
    key: "judgment_proof",
    label: "Judgment-proof (collection-proof) — sometimes doing little is rational",
    summary:
      "If all of your income and property is exempt under Texas law, a creditor can win a judgment but be unable to actually collect. For some people, that reality means an aggressive response isn't necessary.",
    bestWhen: [
      "Your income is exempt (Texas wages generally can't be garnished for ordinary debt) and your property is within the exemptions.",
      "The debt is mostly old consumer debt and you have little a creditor could reach.",
    ],
    watchOut: [
      "A judgment still hurts your credit and can last years, and a non-exempt bank account can be levied.",
      "Your situation can change (a new job, an inheritance) and expose you later.",
      "This is NOT 'ignore a lawsuit' — you must still answer a suit to avoid a default judgment.",
    ],
    relevant_statutes: ["tx-wage-exemption", "tx-homestead", "tx-personal-property", "tx-limitations-debt"],
    relevant_instruments: ["answer_to_debt_suit"],
  },
  debt_management_plan: {
    key: "debt_management_plan",
    label: "Nonprofit credit counseling / debt-management plan",
    summary:
      "A nonprofit credit counseling agency consolidates your payments and negotiates lower interest, and you repay over time — a structured, lower-cost middle path.",
    bestWhen: [
      "You have steady income and mostly credit-card debt.",
      "You want structure and to avoid filing, and aren't behind on secured debt you need to cure.",
    ],
    watchOut: [
      "Not all debts qualify, and plans typically take several years.",
      "Use a reputable nonprofit agency and watch for fees.",
    ],
    relevant_statutes: [],
    relevant_instruments: ["debt_settlement_proposal"],
  },
};

const FIT_ORDER: Record<Fit, number> = { strong: 0, possible: 1, unlikely: 2 };

function rate(key: DebtOptionKey, s: OptionSignals): { fit: Fit; reason: string } {
  switch (key) {
    case "chapter_7":
      if (s.priorCh7Within8yr) return { fit: "unlikely", reason: "A Chapter 7 discharge in the last 8 years bars another." };
      if (s.belowMedian === true) return { fit: "strong", reason: "You're below the median, so Chapter 7 is available on income." };
      if (s.belowMedian === false) return { fit: "possible", reason: "Above median — possible only if you pass the full means test." };
      return { fit: "possible", reason: "Often the fastest path if your income and assets qualify." };
    case "chapter_13":
      if (s.regularIncome === false) return { fit: "unlikely", reason: "Chapter 13 needs steady income to fund a plan." };
      if (s.behindOnSecuredWantKeep && s.regularIncome) return { fit: "strong", reason: "Lets you cure the arrears and keep the house/car." };
      if (s.belowMedian === false && s.regularIncome) return { fit: "strong", reason: "A repayment plan when income is too high for Chapter 7." };
      return { fit: "possible", reason: "An option if you have regular income or assets to protect." };
    case "negotiate_settle":
      if (s.hasLumpSumToSettle) return { fit: "strong", reason: "A lump sum gives you real leverage to settle for less." };
      return { fit: "possible", reason: "Worth trying for a few debts, even without a lump sum." };
    case "judgment_proof":
      if (s.assetsMostlyExempt && s.regularIncome === false) return { fit: "strong", reason: "Exempt income and property may leave little a creditor can collect." };
      if (s.assetsMostlyExempt === false) return { fit: "unlikely", reason: "You have non-exempt assets a creditor could reach." };
      return { fit: "possible", reason: "May apply if your income and property are largely exempt." };
    case "debt_management_plan":
      if (s.regularIncome && !s.behindOnSecuredWantKeep) return { fit: "strong", reason: "Steady income plus mostly credit-card debt is the sweet spot." };
      if (s.regularIncome === false) return { fit: "unlikely", reason: "A repayment plan needs income to fund it." };
      return { fit: "possible", reason: "A structured middle path if you can fund payments." };
  }
}

const CANONICAL: DebtOptionKey[] = [
  "chapter_7",
  "chapter_13",
  "negotiate_settle",
  "debt_management_plan",
  "judgment_proof",
];

export function getDebtOption(key: DebtOptionKey): DebtOption {
  return OPTIONS[key];
}

/** All options in canonical order (no ranking). */
export const DEBT_OPTIONS: DebtOption[] = CANONICAL.map((k) => OPTIONS[k]);

/**
 * Rank the options for a person's signals. Strong fits first, then possible,
 * then unlikely; canonical order within each tier. Deterministic.
 */
export function recommendDebtOptions(signals: OptionSignals = {}): RankedOption[] {
  return CANONICAL.map((key) => {
    const { fit, reason } = rate(key, signals);
    return { ...OPTIONS[key], fit, reason };
  }).sort((a, b) => {
    const byFit = FIT_ORDER[a.fit] - FIT_ORDER[b.fit];
    if (byFit !== 0) return byFit;
    return CANONICAL.indexOf(a.key) - CANONICAL.indexOf(b.key);
  });
}

const DISCLAIMER =
  "This is general legal information to help you think through your options, not legal advice or a recommendation. The right path depends on your full financial picture; a consult — and free resources like nonprofit credit counseling and Texas legal aid — can help you decide.";

export function debtOptionsDisclaimer(): string {
  return DISCLAIMER;
}
