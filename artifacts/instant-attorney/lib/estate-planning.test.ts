import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ESTATE_INSTRUMENTS,
  recommendEstatePlan,
  getEstateInstrument,
  trustVerdict,
  estatePlanDisclaimer,
} from "./estate-planning.ts";
import { isKnownEstateStatuteKey } from "./estate-statutes.ts";

test("every instrument has complete fields and resolvable statute references", () => {
  assert.ok(ESTATE_INSTRUMENTS.length >= 1);
  for (const i of ESTATE_INSTRUMENTS) {
    assert.ok(i.label && i.summary && i.costBand, `${i.key} core fields`);
    assert.ok(i.bestWhen.length > 0 && i.watchOut.length > 0, `${i.key} has best/watch`);
    for (const k of i.relevant_statutes) assert.ok(isKnownEstateStatuteKey(k), `${i.key} bad statute ${k}`);
  }
});

test("default recommendation returns all instruments, essentials first", () => {
  const r = recommendEstatePlan();
  assert.equal(r.length, ESTATE_INSTRUMENTS.length);
  assert.ok(r.every((i) => i.fit && i.reason));
  // The will and the two incapacity documents are always essential.
  const essentials = r.filter((i) => i.fit === "essential").map((i) => i.key);
  assert.ok(essentials.includes("will_based_plan"));
  assert.ok(essentials.includes("financial_power_of_attorney"));
  assert.ok(essentials.includes("medical_directives"));
  assert.equal(r[0].fit, "essential");
});

test("the honest thesis: a simple Texas estate does NOT get a strong trust push", () => {
  const r = recommendEstatePlan({ ownsHome: true, minorChildren: false });
  const trust = r.find((i) => i.key === "revocable_living_trust")!;
  assert.equal(trust.fit, "optional");
  // The cheap home tool should be the strong pick instead.
  const todd = r.find((i) => i.key === "transfer_on_death_deed")!;
  assert.equal(todd.fit, "strong");
  assert.match(trustVerdict({ ownsHome: true }), /don't need an expensive trust/i);
});

test("out-of-state real estate makes a living trust a strong fit", () => {
  const r = recommendEstatePlan({ outOfStateRealEstate: true });
  const trust = r.find((i) => i.key === "revocable_living_trust")!;
  assert.equal(trust.fit, "strong");
  assert.match(trust.reason, /out-of-state|second probate/i);
  assert.match(trustVerdict({ outOfStateRealEstate: true }), /worth it/i);
});

test("two trust payoffs (privacy + incapacity) make it strong; one alone is only 'consider'", () => {
  const strong = recommendEstatePlan({ wantsPrivacy: true, wantsIncapacityManagement: true })
    .find((i) => i.key === "revocable_living_trust")!;
  assert.equal(strong.fit, "strong");

  const one = recommendEstatePlan({ wantsPrivacy: true })
    .find((i) => i.key === "revocable_living_trust")!;
  assert.equal(one.fit, "consider");
});

test("minor children make a guardian designation essential", () => {
  const r = recommendEstatePlan({ minorChildren: true });
  const g = r.find((i) => i.key === "guardian_designation")!;
  assert.equal(g.fit, "essential");
});

test("a disabled beneficiary makes a special needs trust essential and warns against direct gifts", () => {
  const r = recommendEstatePlan({ disabledBeneficiary: true });
  const snt = r.find((i) => i.key === "special_needs_trust")!;
  assert.equal(snt.fit, "essential");
  assert.ok(snt.watchOut.some((w) => /directly/i.test(w)));
});

test("essential fits always sort ahead of strong, consider, and optional", () => {
  const r = recommendEstatePlan({ ownsHome: true, outOfStateRealEstate: true, minorChildren: true });
  const order = ["essential", "strong", "consider", "optional"];
  const ranks = r.map((i) => order.indexOf(i.fit));
  for (let k = 1; k < ranks.length; k++) {
    assert.ok(ranks[k] >= ranks[k - 1], "fits must be non-decreasing in rank");
  }
});

test("lookup + disclaimer", () => {
  assert.equal(getEstateInstrument("will_based_plan").label, "Will with independent administration");
  const d = estatePlanDisclaimer();
  assert.ok(d.length > 0);
  // The disclaimer must carry the Texas-specific demystifier.
  assert.match(d, /no state death tax|independent administration/i);
});
