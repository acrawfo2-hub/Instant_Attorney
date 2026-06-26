import { test } from "node:test";
import assert from "node:assert/strict";
import { computePiFaultImpact, piFaultToFact } from "./pi-fault-calc.ts";

test("zero fault => full recovery", () => {
  const r = computePiFaultImpact({ totalDamages: 100000, claimantFaultPct: 0 });
  assert.equal(r.barred, false);
  assert.equal(r.netRecovery, 100000);
});

test("50% fault => half recovery (not barred)", () => {
  const r = computePiFaultImpact({ totalDamages: 100000, claimantFaultPct: 50 });
  assert.equal(r.barred, false);
  assert.equal(r.netRecovery, 50000);
});

test("over 50% fault => barred", () => {
  const r = computePiFaultImpact({ totalDamages: 100000, claimantFaultPct: 51 });
  assert.equal(r.barred, true);
  assert.equal(r.netRecovery, 0);
});

test("piFaultToFact", () => {
  const input = { totalDamages: 50000, claimantFaultPct: 20 };
  const r = computePiFaultImpact(input);
  const fact = piFaultToFact(input, r);
  assert.match(fact.value, /est\. net recovery/);
});
