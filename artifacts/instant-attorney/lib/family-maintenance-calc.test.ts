import { test } from "node:test";
import assert from "node:assert/strict";
import {
  screenMaintenance,
  maintenanceScreenToFact,
  formatMaintenanceScreen,
  MAINTENANCE_FACT_LABEL,
} from "./family-maintenance-calc.ts";

test("threshold gate: not eligible if minimum needs are met", () => {
  const s = screenMaintenance({ marriageYears: 25, lacksMinimumNeeds: false });
  assert.equal(s.eligible, false);
  assert.equal(s.grounds.length, 0);
  assert.ok(s.assumptions.some((a) => /Threshold not met/i.test(a)));
});

test("short marriage with no other ground is not eligible", () => {
  const s = screenMaintenance({ marriageYears: 6, lacksMinimumNeeds: true });
  assert.equal(s.eligible, false);
  assert.ok(s.assumptions.some((a) => /under 10 years/i.test(a)));
});

test("10-year ground qualifies and carries the §8.053 presumption", () => {
  const s = screenMaintenance({ marriageYears: 12, lacksMinimumNeeds: true });
  assert.equal(s.eligible, true);
  assert.equal(s.likelyMaxDurationYears, 5);
  assert.ok(s.presumptionNote && /8.053/.test(s.presumptionNote));
});

test("duration scales with marriage length (§8.054)", () => {
  assert.equal(screenMaintenance({ marriageYears: 15, lacksMinimumNeeds: true }).likelyMaxDurationYears, 5);
  assert.equal(screenMaintenance({ marriageYears: 22, lacksMinimumNeeds: true }).likelyMaxDurationYears, 7);
  assert.equal(screenMaintenance({ marriageYears: 31, lacksMinimumNeeds: true }).likelyMaxDurationYears, 10);
});

test("family violence qualifies regardless of marriage length, no length presumption", () => {
  const s = screenMaintenance({ marriageYears: 3, lacksMinimumNeeds: true, familyViolence: true });
  assert.equal(s.eligible, true);
  assert.equal(s.likelyMaxDurationYears, 5);
  assert.equal(s.presumptionNote, null); // not the length-only ground
});

test("disability ground makes duration open-ended (null) with a review note", () => {
  const s = screenMaintenance({ marriageYears: 12, lacksMinimumNeeds: true, seekingSpouseDisability: true });
  assert.equal(s.eligible, true);
  assert.equal(s.likelyMaxDurationYears, null);
  assert.ok(/review/i.test(s.durationNote));
});

test("amount cap is the lesser of $5,000 or 20% of gross (§8.055)", () => {
  // 20% of 30,000 = 6,000 -> capped at 5,000
  const high = screenMaintenance({ marriageYears: 12, lacksMinimumNeeds: true, payorAverageMonthlyGrossIncome: 30000 });
  assert.equal(high.amountCapMonthly, 5000);
  // 20% of 10,000 = 2,000 -> 2,000 governs
  const low = screenMaintenance({ marriageYears: 12, lacksMinimumNeeds: true, payorAverageMonthlyGrossIncome: 10000 });
  assert.equal(low.amountCapMonthly, 2000);
  // no income -> null, note explains the rule
  const none = screenMaintenance({ marriageYears: 12, lacksMinimumNeeds: true });
  assert.equal(none.amountCapMonthly, null);
  assert.ok(/20%/.test(none.amountNote));
});

test("fact + formatter reflect eligibility", () => {
  const eligible = screenMaintenance({ marriageYears: 22, lacksMinimumNeeds: true, payorAverageMonthlyGrossIncome: 8000 });
  const fact = maintenanceScreenToFact(eligible);
  assert.equal(fact.label, MAINTENANCE_FACT_LABEL);
  assert.match(fact.value, /eligible/i);
  assert.match(fact.value, /7 years/);
  assert.match(formatMaintenanceScreen(eligible), /likely eligible/i);

  const not = screenMaintenance({ marriageYears: 4, lacksMinimumNeeds: true });
  assert.match(maintenanceScreenToFact(not).value, /does NOT qualify/i);
  assert.match(formatMaintenanceScreen(not), /not eligible/i);
});
