import { test } from "node:test";
import assert from "node:assert/strict";
import {
  screenPiSol,
  piSolToFact,
  formatPiSol,
  PI_SOL_FACT_LABEL,
} from "./pi-sol-calc.ts";

const AS_OF = new Date("2026-06-01T12:00:00");

test("general PI: two years from incident", () => {
  const r = screenPiSol({ incidentDate: "2024-07-01", claimType: "auto_accident" }, AS_OF);
  assert.equal(r.filingDeadline, "2026-07-01");
  assert.equal(r.expired, false);
  assert.ok(r.daysRemaining > 0);
  assert.equal(r.urgency, "warning");
});

test("expired deadline is flagged", () => {
  const r = screenPiSol({ incidentDate: "2022-01-01", claimType: "general_pi" }, AS_OF);
  assert.equal(r.expired, true);
  assert.equal(r.urgency, "expired");
  assert.ok(r.daysRemaining < 0);
});

test("critical urgency inside 90 days", () => {
  const r = screenPiSol({ incidentDate: "2024-04-15", claimType: "premises" }, AS_OF);
  assert.equal(r.urgency, "critical");
});

test("med mal includes repose deadline", () => {
  const r = screenPiSol(
    { incidentDate: "2015-06-01", claimType: "medical_malpractice", treatmentEndDate: "2015-08-01" },
    AS_OF
  );
  assert.ok(r.reposeDeadline);
  assert.equal(r.reposeExpired, true);
});

test("piSolToFact and formatPiSol", () => {
  const input = { incidentDate: "2025-01-01", claimType: "auto_accident" as const };
  const r = screenPiSol(input, AS_OF);
  const fact = piSolToFact(input, r);
  assert.equal(fact.label, PI_SOL_FACT_LABEL);
  assert.match(fact.value, /filing deadline/);
  assert.match(formatPiSol(r), /Auto/);
});
