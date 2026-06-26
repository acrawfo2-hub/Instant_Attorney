import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runDisposableIncomeTest,
  disposableIncomeToFact,
  formatDisposableIncome,
  MEANS_TEST_THRESHOLDS,
  DISPOSABLE_INCOME_FACT_LABEL,
} from "./bankruptcy-disposable-income.ts";

test("below the lower threshold => passes (no presumption)", () => {
  // 60-month DI = (6000 - 5900) * 60 = 6000 < 10,275
  const r = runDisposableIncomeTest({ monthlyCMI: 6000, monthlyAllowedExpenses: 5900 });
  assert.equal(r.monthlyDisposableIncome, 100);
  assert.equal(r.sixtyMonthDisposableIncome, 6000);
  assert.equal(r.presumption, "none");
  assert.equal(r.passesChapter7, true);
});

test("at or above the upper threshold => presumption arises", () => {
  // 60-month DI = (6000 - 5700) * 60 = 18,000 >= 17,150
  const r = runDisposableIncomeTest({ monthlyCMI: 6000, monthlyAllowedExpenses: 5700 });
  assert.equal(r.sixtyMonthDisposableIncome, 18000);
  assert.equal(r.presumption, "arises");
  assert.equal(r.passesChapter7, false);
});

test("middle band without debt figure => depends_on_debt", () => {
  // 60-month DI = (6000 - 5800) * 60 = 12,000 (between 10,275 and 17,150)
  const r = runDisposableIncomeTest({ monthlyCMI: 6000, monthlyAllowedExpenses: 5800 });
  assert.equal(r.sixtyMonthDisposableIncome, 12000);
  assert.equal(r.presumption, "depends_on_debt");
  assert.equal(r.passesChapter7, null);
});

test("middle band with debt: presumption depends on the 25% comparison", () => {
  // 60-month DI = 12,000. 25% of 40,000 = 10,000 -> DI >= that -> presumption arises
  const arises = runDisposableIncomeTest({
    monthlyCMI: 6000,
    monthlyAllowedExpenses: 5800,
    nonPriorityUnsecuredDebt: 40000,
  });
  assert.equal(arises.presumption, "arises");
  assert.equal(arises.passesChapter7, false);

  // 25% of 60,000 = 15,000 -> DI (12,000) below that -> no presumption
  const passes = runDisposableIncomeTest({
    monthlyCMI: 6000,
    monthlyAllowedExpenses: 5800,
    nonPriorityUnsecuredDebt: 60000,
  });
  assert.equal(passes.presumption, "none");
  assert.equal(passes.passesChapter7, true);
});

test("negative disposable income passes", () => {
  const r = runDisposableIncomeTest({ monthlyCMI: 5000, monthlyAllowedExpenses: 6000 });
  assert.ok(r.monthlyDisposableIncome < 0);
  assert.equal(r.passesChapter7, true);
});

test("expense components are summed", () => {
  const r = runDisposableIncomeTest({
    monthlyCMI: 7000,
    expenseComponents: { livingStandards: 1500, housingUtilities: 2000, transportation: 600, taxesAndPayroll: 1500, healthAndInsurance: 300 },
  });
  assert.equal(r.totalDeductions, 5900);
  assert.ok(r.assumptions.some((a) => /summed/i.test(a)));
});

test("thresholds match the documented Apr 1, 2025 figures", () => {
  assert.equal(MEANS_TEST_THRESHOLDS.lower, 10275);
  assert.equal(MEANS_TEST_THRESHOLDS.upper, 17150);
  assert.equal(MEANS_TEST_THRESHOLDS.asOf, "2025-04-01");
});

test("invalid input throws", () => {
  assert.throws(() => runDisposableIncomeTest({ monthlyCMI: -1, monthlyAllowedExpenses: 100 }), RangeError);
  assert.throws(() => runDisposableIncomeTest({ monthlyCMI: 5000 }), RangeError); // no expenses
});

test("fact + formatter reflect the verdict", () => {
  const pass = runDisposableIncomeTest({ monthlyCMI: 6000, monthlyAllowedExpenses: 5900 });
  assert.equal(disposableIncomeToFact(pass).label, DISPOSABLE_INCOME_FACT_LABEL);
  assert.match(disposableIncomeToFact(pass).value, /passes/i);
  assert.match(formatDisposableIncome(pass), /Chapter 7 available/i);

  const fail = runDisposableIncomeTest({ monthlyCMI: 6000, monthlyAllowedExpenses: 5700 });
  assert.match(formatDisposableIncome(fail), /Chapter 13/i);
});
