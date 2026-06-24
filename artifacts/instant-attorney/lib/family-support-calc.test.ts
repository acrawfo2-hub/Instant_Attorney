import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estimateChildSupport,
  formatChildSupportEstimate,
  childSupportEstimateToFact,
  CHILD_SUPPORT_FACT_LABEL,
  DEFAULT_NET_RESOURCES_CAP,
} from "./family-support-calc.ts";

test("standard guideline percentages by number of children (no other children)", () => {
  const net = 5000;
  const cases: Array<[number, number]> = [
    [1, 20],
    [2, 25],
    [3, 30],
    [4, 35],
    [5, 40],
    [6, 40], // 6+ floored at the 5-child amount
  ];
  for (const [kids, pct] of cases) {
    const est = estimateChildSupport({ netMonthlyResources: net, childrenBeforeCourt: kids });
    assert.equal(est.applicablePercentage, pct, `${kids} children -> ${pct}%`);
    assert.equal(est.monthlyAmount, Math.round(net * (pct / 100) * 100) / 100);
    assert.equal(est.multipleFamilyAdjusted, false);
  }
});

test("one child at $5,000 net = $1,000/month", () => {
  const est = estimateChildSupport({ netMonthlyResources: 5000, childrenBeforeCourt: 1 });
  assert.equal(est.monthlyAmount, 1000);
  assert.ok(est.disclaimer.length > 0);
});

test("net resources are capped at the statutory cap", () => {
  const est = estimateChildSupport({
    netMonthlyResources: 20000,
    childrenBeforeCourt: 2,
  });
  assert.equal(est.capApplied, true);
  assert.equal(est.cappedNetResources, DEFAULT_NET_RESOURCES_CAP);
  // 25% of the statutory cap (two children)
  assert.equal(est.monthlyAmount, Math.round(DEFAULT_NET_RESOURCES_CAP * 0.25 * 100) / 100);
  assert.ok(est.assumptions.some((a) => a.includes("cap")));
});

test("default cap matches the current OAG figure ($11,700, eff. Sept 1, 2025)", () => {
  // Locks the live statutory value so an accidental change is caught and the
  // figure is documented. Update with the OAG's next six-year adjustment.
  assert.equal(DEFAULT_NET_RESOURCES_CAP, 11700);
  // One child at/above the cap => 20% of $11,700 = $2,340/month.
  const est = estimateChildSupport({ netMonthlyResources: 50000, childrenBeforeCourt: 1 });
  assert.equal(est.monthlyAmount, 2340);
});

test("capOverride uses the provided cap", () => {
  const est = estimateChildSupport({
    netMonthlyResources: 20000,
    childrenBeforeCourt: 1,
    capOverride: 10000,
  });
  assert.equal(est.capUsed, 10000);
  assert.equal(est.cappedNetResources, 10000);
  assert.equal(est.monthlyAmount, 2000); // 20% of 10,000
});

test("multiple-family adjustment lowers the percentage (§ 154.129)", () => {
  const base = estimateChildSupport({ netMonthlyResources: 4000, childrenBeforeCourt: 1 });
  const adjusted = estimateChildSupport({
    netMonthlyResources: 4000,
    childrenBeforeCourt: 1,
    otherChildren: 2,
  });
  assert.equal(base.applicablePercentage, 20);
  assert.equal(adjusted.applicablePercentage, 16.0); // table row 2, col 1
  assert.equal(adjusted.multipleFamilyAdjusted, true);
  assert.ok(adjusted.monthlyAmount < base.monthlyAmount);
});

test("negative net resources are treated as zero", () => {
  const est = estimateChildSupport({ netMonthlyResources: -500, childrenBeforeCourt: 1 });
  assert.equal(est.monthlyAmount, 0);
  assert.ok(est.assumptions.some((a) => a.toLowerCase().includes("negative")));
});

test("invalid child count throws", () => {
  assert.throws(() => estimateChildSupport({ netMonthlyResources: 5000, childrenBeforeCourt: 0 }), RangeError);
});

test("estimate-to-fact uses the stable label and carries inputs + caveat", () => {
  const input = { netMonthlyResources: 5000, childrenBeforeCourt: 1 };
  const est = estimateChildSupport(input);
  const fact = childSupportEstimateToFact(input, est);
  assert.equal(fact.label, CHILD_SUPPORT_FACT_LABEL);
  assert.ok(fact.value.includes("$1,000"));
  assert.ok(fact.value.includes("1 child"));
  assert.ok(/estimate only/i.test(fact.value));
});

test("estimate-to-fact notes the cap and other children when present", () => {
  const input = { netMonthlyResources: 20000, childrenBeforeCourt: 2, otherChildren: 1 };
  const est = estimateChildSupport(input);
  const fact = childSupportEstimateToFact(input, est);
  assert.ok(/cap/i.test(fact.value));
  assert.ok(fact.value.includes("1 other child"));
});

test("formatter produces a readable one-liner with a dollar amount", () => {
  const est = estimateChildSupport({ netMonthlyResources: 5000, childrenBeforeCourt: 1 });
  const line = formatChildSupportEstimate(est);
  assert.ok(line.includes("$1,000"));
  assert.ok(/month/i.test(line));
});
