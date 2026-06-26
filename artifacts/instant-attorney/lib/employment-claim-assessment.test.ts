import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assessEmploymentClaim,
  employmentClaimToFact,
  EMPLOYMENT_CLAIM_FACT_LABEL,
} from "./employment-claim-assessment.ts";
import { isKnownEmploymentStatuteKey } from "./employment-statutes.ts";
import { isKnownEmploymentInstrumentKey } from "./employment-instruments.ts";

test("a race-discrimination firing yields a Title VII claim via the EEOC with a 300-day deadline", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", protectedClass: "race", monthsSinceAction: 2, employerSize: "100-plus" });
  const claim = a.claims.find((c) => c.key === "discrimination")!;
  assert.ok(claim);
  assert.match(claim.forum, /EEOC/);
  assert.equal(claim.deadlineDays, 300);
  assert.equal(claim.urgency, "ok");
  assert.ok(a.relevant_instruments.includes("eeoc_tchra_charge"));
});

test("age discrimination uses the ADEA and flags small-employer coverage (needs 20)", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", protectedClass: "age_40_plus", employerSize: "15-19" });
  const claim = a.claims.find((c) => c.key === "age_discrimination")!;
  assert.ok(claim.relevant_statutes.includes("adea"));
  assert.ok(claim.coverageNote && /20\+/.test(claim.coverageNote));
});

test("retaliation stands alone even without a protected class", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", retaliation: true });
  assert.ok(a.claims.some((c) => c.key === "retaliation"));
});

test("a deadline more than ~300 days out is flagged likely_passed (severe)", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", protectedClass: "sex", monthsSinceAction: 11 });
  const claim = a.claims.find((c) => c.key === "discrimination")!;
  assert.equal(claim.urgency, "likely_passed");
  assert.ok(a.warnings.some((w) => w.severe && /deadline/i.test(w.text)));
});

test("a near deadline is flagged soon with an urgent action", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", protectedClass: "sex", monthsSinceAction: 9 });
  assert.equal(a.claims[0].urgency, "soon");
  assert.ok(a.actions.some((x) => x.urgent && /deadline/i.test(x.step)));
});

test("a wage issue produces an FLSA / Payday claim with the 180-day TWC deadline", () => {
  const a = assessEmploymentClaim({ wageIssue: true, monthsSinceAction: 1 });
  const claim = a.claims.find((c) => c.key === "wage_hour")!;
  assert.equal(claim.deadlineDays, 180);
  assert.ok(claim.relevant_statutes.includes("flsa"));
});

test("refusing an illegal act yields a Sabine Pilot court claim (no agency)", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", refusedIllegalAct: true });
  const claim = a.claims.find((c) => c.key === "sabine_pilot")!;
  assert.match(claim.forum, /court/i);
});

test("no protected reason => no statutory claim, but the at-will reality is explained", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", protectedClass: "none" });
  assert.equal(a.claims.length, 0);
  assert.match(a.atWillNote, /at-will/i);
  assert.ok(a.actions.some((x) => /attorney/i.test(x.step)));
});

test("always advises preserving evidence and never to sign a release blind", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", protectedClass: "religion" });
  assert.ok(a.actions.some((x) => /preserve/i.test(x.step) && x.urgent));
  assert.ok(a.actions.some((x) => /severance|release/i.test(x.step)));
});

test("references resolve; fact reflects the verdict", () => {
  const a = assessEmploymentClaim({ adverseAction: "fired", protectedClass: "disability", monthsSinceAction: 11 });
  for (const c of a.claims) for (const k of c.relevant_statutes) assert.ok(isKnownEmploymentStatuteKey(k), `bad statute ${k}`);
  for (const k of a.relevant_instruments) assert.ok(isKnownEmploymentInstrumentKey(k), `bad instrument ${k}`);
  const fact = employmentClaimToFact(a);
  assert.equal(fact.label, EMPLOYMENT_CLAIM_FACT_LABEL);
  assert.match(fact.value, /DEADLINE FLAG/);
  assert.match(employmentClaimToFact(assessEmploymentClaim({ protectedClass: "none" })).value, /at-will/i);
});
