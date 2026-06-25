import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runMeansTest,
  texasMedianForHousehold,
  meansTestToFact,
  formatMeansTest,
  MEANS_TEST_FACT_LABEL,
  TX_MEANS_TEST,
} from "./bankruptcy-means-test.ts";

test("texas median lookup by household size, with per-person add above 4", () => {
  assert.equal(texasMedianForHousehold(1), 65123);
  assert.equal(texasMedianForHousehold(4), 114938);
  // 6 people: 4-person median + 2 * per-additional
  assert.equal(texasMedianForHousehold(6), 114938 + 2 * 11100);
  // < 1 clamps to 1
  assert.equal(texasMedianForHousehold(0), 65123);
});

test("below median => Chapter 7 presumed available", () => {
  const r = runMeansTest({ householdSize: 1, annualIncome: 50000 });
  assert.equal(r.belowMedian, true);
  assert.equal(r.outcome, "ch7_presumed_available");
  assert.equal(r.medianIncome, 65123);
  assert.equal(r.marginAnnual, 15123);
  assert.match(r.guidance, /generally available/i);
});

test("above median => full means test required", () => {
  const r = runMeansTest({ householdSize: 1, annualIncome: 90000 });
  assert.equal(r.belowMedian, false);
  assert.equal(r.outcome, "full_means_test_required");
  assert.ok(r.marginAnnual < 0);
  assert.match(r.guidance, /full means test/i);
});

test("exactly at median counts as below (at-or-below passes)", () => {
  const r = runMeansTest({ householdSize: 2, annualIncome: 84491 });
  assert.equal(r.belowMedian, true);
  assert.equal(r.marginAnnual, 0);
});

test("average monthly income is annualized x12", () => {
  const r = runMeansTest({ householdSize: 2, averageMonthlyIncome: 5000 });
  assert.equal(r.annualIncome, 60000);
  assert.equal(r.belowMedian, true); // 60k < 84,491
  assert.ok(r.assumptions.some((a) => /annualized/i.test(a)));
});

test("medianOverride is used and labeled", () => {
  const r = runMeansTest({ householdSize: 1, annualIncome: 68000, medianOverride: 70000 });
  assert.equal(r.medianSource, "override");
  assert.equal(r.medianIncome, 70000);
  assert.equal(r.medianAsOf, "user-provided");
  assert.equal(r.belowMedian, true);
});

test("household over 4 notes the per-person addition", () => {
  const r = runMeansTest({ householdSize: 6, annualIncome: 100000 });
  assert.equal(r.medianIncome, 137138);
  assert.ok(r.assumptions.some((a) => /per additional person/i.test(a)));
});

test("invalid input throws", () => {
  assert.throws(() => runMeansTest({ householdSize: 0, annualIncome: 50000 }), RangeError);
  assert.throws(() => runMeansTest({ householdSize: 1 }), RangeError); // no income provided
});

test("the dated Texas table matches the documented figures", () => {
  // Locks the encoded figures so a silent edit is caught; update on each UST revision.
  assert.equal(TX_MEANS_TEST.asOf, "2025-11-01");
  assert.deepEqual(TX_MEANS_TEST.byHousehold, { 1: 65123, 2: 84491, 3: 96728, 4: 114938 });
  assert.equal(TX_MEANS_TEST.perAdditionalPerson, 11100);
});

test("fact + formatter reflect the verdict", () => {
  const below = runMeansTest({ householdSize: 1, annualIncome: 50000 });
  const fact = meansTestToFact(below);
  assert.equal(fact.label, MEANS_TEST_FACT_LABEL);
  assert.match(fact.value, /below the Texas median/i);
  assert.match(formatMeansTest(below), /generally available/i);

  const above = runMeansTest({ householdSize: 1, annualIncome: 90000 });
  assert.match(meansTestToFact(above).value, /full means test/i);
  assert.match(formatMeansTest(above), /full means test/i);
});
