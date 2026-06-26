// ── Chapter 7 means test — the full (disposable-income) step ──────────────────
//
// When a filer is ABOVE the state median, the median screen isn't the end — they
// complete the full means test (Form 122A-2), deducting allowed living expenses
// from current monthly income and applying the § 707(b)(2) presumption-of-abuse
// thresholds to the 60-month disposable income. This module runs that
// determination. Many above-median filers still pass after the deductions.
//
// The allowed-expense itemization relies on IRS Collection Financial Standards
// (national + county-specific local standards) plus actual necessary expenses and
// average secured/priority debt payments — too large and too volatile to encode
// here — so expenses are an INPUT (a total, or a few components we sum). What this
// module owns is the § 707(b)(2) logic and the threshold figures, which ARE
// encoded, dated, sourced, and registered in the legal-freshness registry.
//
// Pure and deterministic. General legal information, not legal advice.

/** § 707(b)(2)(A)(i) presumption thresholds applied to 60-month disposable income.
 * The U.S. Trustee adjusts these every three years (next April 1, 2028). */
export const MEANS_TEST_THRESHOLDS = {
  asOf: "2025-04-01",
  /** Below this, no presumption (pass). */
  lower: 10275,
  /** At or above this, presumption arises (fail). */
  upper: 17150,
  source: "https://www.justice.gov/ust/means-testing",
} as const;

export interface ExpenseComponents {
  /** IRS National Standards — food, clothing, personal care, household supplies. */
  livingStandards?: number;
  /** IRS Local Standards — housing & utilities (county-specific). */
  housingUtilities?: number;
  /** IRS Local Standards — transportation (ownership + operating). */
  transportation?: number;
  /** Taxes and mandatory payroll deductions. */
  taxesAndPayroll?: number;
  /** Health care, health/disability insurance, term life. */
  healthAndInsurance?: number;
  /** Average monthly payment on secured debts (e.g. mortgage/car), per the form. */
  securedDebtMonthly?: number;
  /** Priority debt (support arrears, certain taxes) divided over 60 months. */
  priorityDebtMonthly?: number;
  /** Other necessary expenses the form allows (childcare, court-ordered, etc.). */
  otherNecessary?: number;
}

export interface DisposableIncomeInput {
  /** Current monthly income (the above-median figure). */
  monthlyCMI: number;
  /** Total allowed monthly deductions. Provide this OR expenseComponents. */
  monthlyAllowedExpenses?: number;
  expenseComponents?: ExpenseComponents;
  /** Total nonpriority unsecured debt, for the middle-band 25% comparison. */
  nonPriorityUnsecuredDebt?: number;
}

export type Presumption = "none" | "arises" | "depends_on_debt";

export interface DisposableIncomeResult {
  monthlyCMI: number;
  totalDeductions: number;
  monthlyDisposableIncome: number;
  sixtyMonthDisposableIncome: number;
  lowerThreshold: number;
  upperThreshold: number;
  thresholdsAsOf: string;
  presumption: Presumption;
  /** true = passes (Chapter 7 ok), false = presumption of abuse, null = needs debt figure. */
  passesChapter7: boolean | null;
  guidance: string;
  assumptions: string[];
  disclaimer: string;
}

const DISCLAIMER =
  "This runs the § 707(b)(2) presumption test on the figures you provide — general information, not legal advice. The allowed-expense amounts come from IRS Collection Financial Standards and detailed rules (Form 122A-2); getting them right is where the test is won or lost, so confirm them with the official standards or an attorney. The thresholds adjust every three years.";

function sumComponents(c: ExpenseComponents): number {
  return (
    (c.livingStandards ?? 0) +
    (c.housingUtilities ?? 0) +
    (c.transportation ?? 0) +
    (c.taxesAndPayroll ?? 0) +
    (c.healthAndInsurance ?? 0) +
    (c.securedDebtMonthly ?? 0) +
    (c.priorityDebtMonthly ?? 0) +
    (c.otherNecessary ?? 0)
  );
}

/**
 * Run the § 707(b)(2) disposable-income determination. Deterministic.
 */
export function runDisposableIncomeTest(input: DisposableIncomeInput): DisposableIncomeResult {
  const monthlyCMI = Number.isFinite(input.monthlyCMI) ? Math.max(0, input.monthlyCMI) : 0;
  if (!Number.isFinite(input.monthlyCMI) || input.monthlyCMI < 0) {
    throw new RangeError("monthlyCMI must be a non-negative number");
  }

  const assumptions: string[] = [];
  let totalDeductions: number;
  if (Number.isFinite(input.monthlyAllowedExpenses)) {
    totalDeductions = Math.max(0, input.monthlyAllowedExpenses as number);
  } else if (input.expenseComponents) {
    totalDeductions = Math.max(0, sumComponents(input.expenseComponents));
    assumptions.push("Total allowed deductions summed from the components provided.");
  } else {
    throw new RangeError("Provide monthlyAllowedExpenses or expenseComponents");
  }

  const monthlyDisposableIncome = Math.round((monthlyCMI - totalDeductions) * 100) / 100;
  const sixtyMonthDisposableIncome = Math.round(monthlyDisposableIncome * 60 * 100) / 100;

  const { lower, upper } = MEANS_TEST_THRESHOLDS;
  let presumption: Presumption;
  let passesChapter7: boolean | null;
  let guidance: string;

  if (sixtyMonthDisposableIncome < lower) {
    presumption = "none";
    passesChapter7 = true;
    guidance =
      "Your 60-month disposable income is below the lower threshold, so the presumption of abuse does not arise — you pass the means test and Chapter 7 is available on this basis.";
  } else if (sixtyMonthDisposableIncome >= upper) {
    presumption = "arises";
    passesChapter7 = false;
    guidance =
      "Your 60-month disposable income is at or above the upper threshold, so a presumption of abuse arises — Chapter 7 is generally not available, and Chapter 13 is usually the path. An attorney can check for allowed expenses you may have missed.";
  } else {
    // Middle band: presumption arises only if 60-month DI >= 25% of nonpriority unsecured debt.
    const debt = input.nonPriorityUnsecuredDebt;
    if (debt != null && Number.isFinite(debt) && debt >= 0) {
      const quarter = Math.round(debt * 0.25 * 100) / 100;
      const arises = sixtyMonthDisposableIncome >= quarter;
      presumption = arises ? "arises" : "none";
      passesChapter7 = !arises;
      guidance = arises
        ? `In the middle band, your 60-month disposable income (${money(sixtyMonthDisposableIncome)}) is at or above 25% of your nonpriority unsecured debt (${money(quarter)}), so a presumption of abuse arises.`
        : `In the middle band, your 60-month disposable income (${money(sixtyMonthDisposableIncome)}) is below 25% of your nonpriority unsecured debt (${money(quarter)}), so no presumption arises — you pass.`;
    } else {
      presumption = "depends_on_debt";
      passesChapter7 = null;
      guidance =
        "You're in the middle band, where the result depends on your total nonpriority unsecured debt: the presumption arises only if your 60-month disposable income is at least 25% of that debt. Enter your unsecured debt to resolve it.";
    }
  }

  return {
    monthlyCMI,
    totalDeductions,
    monthlyDisposableIncome,
    sixtyMonthDisposableIncome,
    lowerThreshold: lower,
    upperThreshold: upper,
    thresholdsAsOf: MEANS_TEST_THRESHOLDS.asOf,
    presumption,
    passesChapter7,
    guidance,
    assumptions,
    disclaimer: DISCLAIMER,
  };
}

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

/** A {label, value} pair for the Living File's dedupe-by-prefix fact writer. */
export interface EstimateFact {
  label: string;
  value: string;
}

export const DISPOSABLE_INCOME_FACT_LABEL = "Chapter 7 means test (full / disposable income)";

/** Seed the Living File with the full-test result. */
export function disposableIncomeToFact(result: DisposableIncomeResult): EstimateFact {
  const verdict =
    result.passesChapter7 === true
      ? "passes the full means test — Chapter 7 available on this basis"
      : result.passesChapter7 === false
        ? "presumption of abuse arises — Chapter 13 likely"
        : "in the middle band — needs the unsecured-debt figure to resolve";
  return {
    label: DISPOSABLE_INCOME_FACT_LABEL,
    value: `Monthly disposable income ${money(result.monthlyDisposableIncome)} (×60 = ${money(
      result.sixtyMonthDisposableIncome
    )}); ${verdict}. Estimate from provided expenses; allowed amounts follow IRS standards and Form 122A-2.`,
  };
}

/** One-line human summary. */
export function formatDisposableIncome(result: DisposableIncomeResult): string {
  if (result.passesChapter7 === true) return "Passes the full means test — Chapter 7 available on this basis.";
  if (result.passesChapter7 === false) return "Presumption of abuse arises — Chapter 13 is the likely path.";
  return "Middle band — enter nonpriority unsecured debt to resolve.";
}
