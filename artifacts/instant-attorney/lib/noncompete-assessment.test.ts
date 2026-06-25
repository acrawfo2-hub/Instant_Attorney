import { test } from "node:test";
import assert from "node:assert/strict";
import { assessNoncompete, noncompeteToFact, NONCOMPETE_FACT_LABEL } from "./noncompete-assessment.ts";

const foundation = { ancillaryToAgreement: true, receivedConsideration: true, protectableInterest: true };

test("sound foundation + reasonable terms => likely enforceable", () => {
  const a = assessNoncompete({ ...foundation, timeMonths: 12, geography: "reasonable", activityScope: "narrow" });
  assert.equal(a.enforceability, "likely_enforceable");
});

test("sound foundation but overbroad terms => overbroad/reformable, with the reform warning", () => {
  const a = assessNoncompete({ ...foundation, timeMonths: 48, geography: "broad", activityScope: "broad" });
  assert.equal(a.enforceability, "overbroad_reformable");
  assert.ok(a.warnings.some((w) => w.severe && /reform/i.test(w.text)));
  assert.match(a.reformationNote, /reform/i);
});

test("missing foundation (no consideration) => likely unenforceable", () => {
  const a = assessNoncompete({ ancillaryToAgreement: false, receivedConsideration: false, protectableInterest: true, timeMonths: 12, geography: "reasonable", activityScope: "narrow" });
  assert.equal(a.enforceability, "likely_unenforceable");
});

test("no protectable interest => likely unenforceable", () => {
  const a = assessNoncompete({ ancillaryToAgreement: true, receivedConsideration: true, protectableInterest: false, timeMonths: 12, geography: "reasonable", activityScope: "narrow" });
  assert.equal(a.enforceability, "likely_unenforceable");
});

test("unknown foundation => needs_more_info", () => {
  const a = assessNoncompete({ timeMonths: 12, geography: "reasonable", activityScope: "narrow" });
  assert.equal(a.enforceability, "needs_more_info");
});

test("long duration alone is a concern that triggers reformation territory", () => {
  const a = assessNoncompete({ ...foundation, timeMonths: 36, geography: "reasonable", activityScope: "narrow" });
  assert.equal(a.enforceability, "overbroad_reformable");
  assert.ok(a.factors.find((f) => f.factor.includes("time"))!.status === "concern");
});

test("always surfaces negotiation levers and the right instruments", () => {
  const a = assessNoncompete({ ...foundation, timeMonths: 12, geography: "reasonable", activityScope: "narrow" });
  assert.ok(a.negotiationLevers.length >= 3);
  assert.ok(a.relevant_instruments.includes("noncompete_review"));
  assert.ok(a.relevant_statutes.includes("tx-noncompete"));
});

test("fact reflects the verdict", () => {
  const a = assessNoncompete({ ...foundation, timeMonths: 48, geography: "broad", activityScope: "broad" });
  const fact = noncompeteToFact(a);
  assert.equal(fact.label, NONCOMPETE_FACT_LABEL);
  assert.match(fact.value, /narrow it/i);
});
