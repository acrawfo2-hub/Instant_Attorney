// ── Chapter 7 means test — median-income screen ──────────────────────────────
//
// The #1 bankruptcy question for a middle/lower-income filer: "can I even file
// Chapter 7?" The means test's first and decisive step is the median-income
// screen: annualize the debtor's current monthly income and compare it to the
// state median family income for their household size. At or below median, the
// presumption of abuse does not apply and Chapter 7 is generally available. Above
// median, the debtor must complete the full means test (Form 122A-2, deducting
// allowed expenses); if disposable income is too high, Chapter 13 may be the path.
//
// This module computes the SCREEN (the part that resolves most cases) — it does
// not run the full expense-deduction test, which needs IRS standards and detailed
// facts. Pure and deterministic, no I/O.
//
// VOLATILE DATA: the state median figures are published by the U.S. Trustee
// Program and updated about twice a year. The Texas table below is dated and
// sourced and is registered in lib/legal-freshness/registry.ts; always confirm
// against the current UST table, and `medianOverride` lets a caller supply it.
//
// General legal information, not legal advice.

/** Texas median family income for the means test. UPDATE with each UST revision
 * (~twice yearly); tracked in the legal-freshness registry. */
export const TX_MEANS_TEST = {
  state: "Texas",
  /** Effective date of these figures. */
  asOf: "2025-11-01",
  source: "https://www.justice.gov/ust/means-testing",
  /** Annual median family income by household size. */
  byHousehold: { 1: 65123, 2: 84491, 3: 96728, 4: 114938 } as Record<number, number>,
  /** Added per person for households larger than 4. */
  perAdditionalPerson: 11100,
} as const;

export type MeansTestOutcome = "ch7_presumed_available" | "full_means_test_required";

export interface MeansTestInput {
  /** People in the household (>= 1). */
  householdSize: number;
  /** Annualized current monthly income. Provide this OR averageMonthlyIncome. */
  annualIncome?: number;
  /** Average monthly income over the prior 6 months (CMI); annualized x12. */
  averageMonthlyIncome?: number;
  /** Override the state median (use the current UST figure for any state). */
  medianOverride?: number;
}

export interface MeansTestResult {
  householdSize: number;
  annualIncome: number;
  medianIncome: number;
  medianSource: "texas-table" | "override";
  /** Effective date of the median used, or "user-provided". */
  medianAsOf: string;
  belowMedian: boolean;
  /** median − annualIncome (positive = room below the median). */
  marginAnnual: number;
  marginMonthly: number;
  outcome: MeansTestOutcome;
  guidance: string;
  assumptions: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This is the income (median) screen of the Chapter 7 means test, for general information — not legal advice or a guarantee of eligibility. State median figures change about twice a year (confirm against the current U.S. Trustee table), 'current monthly income' has a specific statutory definition, and being above median does not by itself bar Chapter 7 — the full means test deducts allowed expenses. Other factors (assets, prior filings, good faith) also matter.";

/** Texas median for a household size, adding the per-person amount above 4. */
export function texasMedianForHousehold(householdSize: number): number {
  const n = Math.max(1, Math.floor(householdSize));
  if (n <= 4) return TX_MEANS_TEST.byHousehold[n];
  return TX_MEANS_TEST.byHousehold[4] + (n - 4) * TX_MEANS_TEST.perAdditionalPerson;
}

/**
 * Run the median-income screen of the Chapter 7 means test. Deterministic.
 */
export function runMeansTest(input: MeansTestInput): MeansTestResult {
  const householdSize = Math.floor(input.householdSize);
  if (!Number.isFinite(householdSize) || householdSize < 1) {
    throw new RangeError("householdSize must be a number ≥ 1");
  }

  const assumptions: string[] = [];

  let annualIncome: number;
  if (Number.isFinite(input.annualIncome)) {
    annualIncome = Math.max(0, input.annualIncome as number);
  } else if (Number.isFinite(input.averageMonthlyIncome)) {
    annualIncome = Math.max(0, (input.averageMonthlyIncome as number) * 12);
    assumptions.push("Annualized from average monthly income (×12).");
  } else {
    throw new RangeError("Provide annualIncome or averageMonthlyIncome");
  }

  const useOverride = Number.isFinite(input.medianOverride) && (input.medianOverride as number) > 0;
  const medianIncome = useOverride ? (input.medianOverride as number) : texasMedianForHousehold(householdSize);
  const medianSource: MeansTestResult["medianSource"] = useOverride ? "override" : "texas-table";
  const medianAsOf = useOverride ? "user-provided" : TX_MEANS_TEST.asOf;
  if (!useOverride) {
    assumptions.push(
      `Used the Texas median for a household of ${householdSize} (effective ${TX_MEANS_TEST.asOf}). Confirm against the current U.S. Trustee table.`
    );
    if (householdSize > 4) {
      assumptions.push(
        `Household over 4: added $${TX_MEANS_TEST.perAdditionalPerson.toLocaleString()} per additional person to the 4-person median.`
      );
    }
  }

  const belowMedian = annualIncome <= medianIncome;
  const marginAnnual = Math.round((medianIncome - annualIncome) * 100) / 100;
  const marginMonthly = Math.round((marginAnnual / 12) * 100) / 100;
  const outcome: MeansTestOutcome = belowMedian ? "ch7_presumed_available" : "full_means_test_required";

  const guidance = belowMedian
    ? "Your income is at or below the Texas median for your household size, so the presumption of abuse does not apply — Chapter 7 is generally available on an income basis. You'd still complete the forms and meet the other requirements (credit counseling, the asset/exemption picture, no disqualifying prior filing)."
    : "Your income is above the Texas median, so you'd complete the full means test (Form 122A-2), which deducts allowed living expenses, secured-debt payments, and more. Many above-median filers still qualify for Chapter 7 after those deductions; if not, Chapter 13 (a 3–5 year repayment plan) is usually the path. A consult is worthwhile here.";

  return {
    householdSize,
    annualIncome,
    medianIncome,
    medianSource,
    medianAsOf,
    belowMedian,
    marginAnnual,
    marginMonthly,
    outcome,
    guidance,
    assumptions,
    disclaimer: DISCLAIMER,
  };
}

/** A {label, value} pair for the Living File's dedupe-by-prefix fact writer. */
export interface EstimateFact {
  label: string;
  value: string;
}

export const MEANS_TEST_FACT_LABEL = "Chapter 7 means test (median-income screen)";

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Seed the Living File so bankruptcy guidance/documents reflect the screen result. */
export function meansTestToFact(result: MeansTestResult): EstimateFact {
  const verdict = result.belowMedian
    ? `below the Texas median — Chapter 7 generally available on income (by ${usd(Math.abs(result.marginAnnual))}/yr)`
    : `above the Texas median by ${usd(Math.abs(result.marginAnnual))}/yr — full means test required`;
  return {
    label: MEANS_TEST_FACT_LABEL,
    value: `Household ${result.householdSize}, income ${usd(result.annualIncome)}/yr vs median ${usd(
      result.medianIncome
    )} (eff. ${result.medianAsOf}): ${verdict}. Screen only, not legal advice; confirm the current median and complete the full test.`,
  };
}

/** One-line human summary. */
export function formatMeansTest(result: MeansTestResult): string {
  return result.belowMedian
    ? `Below the Texas median (${usd(result.annualIncome)} vs ${usd(result.medianIncome)}) — Chapter 7 generally available on income.`
    : `Above the Texas median (${usd(result.annualIncome)} vs ${usd(result.medianIncome)}) — full means test required.`;
}
