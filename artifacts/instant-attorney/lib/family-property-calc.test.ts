import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dividePropertyEstate,
  suggestCharacterization,
  propertyDivisionToFact,
  formatPropertyDivisionEstimate,
  PROPERTY_DIVISION_FACT_LABEL,
  type PropertyItem,
} from "./family-property-calc.ts";

test("equal split of a simple community estate", () => {
  const items: PropertyItem[] = [
    { label: "Home equity", value: 200000, kind: "asset", characterization: "community" },
    { label: "401(k)", value: 100000, kind: "asset", characterization: "community" },
    { label: "Credit card", value: 20000, kind: "debt", characterization: "community" },
  ];
  const est = dividePropertyEstate({ items });
  assert.equal(est.communityAssets, 300000);
  assert.equal(est.communityDebts, 20000);
  assert.equal(est.netCommunityEstate, 280000);
  assert.equal(est.communityShareToA, 0.5);
  assert.equal(est.communityAwardA, 140000);
  assert.equal(est.communityAwardB, 140000);
  assert.equal(est.totalToA, 140000);
  assert.equal(est.totalToB, 140000);
});

test("separate property stays with its owner and is not divided", () => {
  const items: PropertyItem[] = [
    { label: "Community savings", value: 50000, kind: "asset", characterization: "community" },
    { label: "Inherited land", value: 80000, kind: "asset", characterization: "separate", owner: "a" },
    { label: "Premarital car", value: 10000, kind: "asset", characterization: "separate", owner: "b" },
  ];
  const est = dividePropertyEstate({ items });
  assert.equal(est.netCommunityEstate, 50000);
  assert.equal(est.separateNetA, 80000);
  assert.equal(est.separateNetB, 10000);
  // A: 25k community + 80k separate; B: 25k community + 10k separate
  assert.equal(est.totalToA, 105000);
  assert.equal(est.totalToB, 35000);
});

test("disproportionate division shifts the community award and notes it", () => {
  const items: PropertyItem[] = [
    { label: "Brokerage", value: 100000, kind: "asset", characterization: "community" },
  ];
  const est = dividePropertyEstate({ items, communityShareToA: 0.6 });
  assert.equal(est.communityAwardA, 60000);
  assert.equal(est.communityAwardB, 40000);
  assert.ok(est.assumptions.some((a) => /disproportionate/i.test(a)));
});

test("share is clamped to [0,1]", () => {
  const items: PropertyItem[] = [
    { label: "Cash", value: 100000, kind: "asset", characterization: "community" },
  ];
  const over = dividePropertyEstate({ items, communityShareToA: 1.5 });
  assert.equal(over.communityShareToA, 1);
  assert.equal(over.communityAwardA, 100000);
  assert.equal(over.communityAwardB, 0);
});

test("separate item without an owner falls to community (community presumption)", () => {
  const items: PropertyItem[] = [
    { label: "Mystery account", value: 40000, kind: "asset", characterization: "separate" },
  ];
  const est = dividePropertyEstate({ items });
  assert.equal(est.netCommunityEstate, 40000);
  assert.equal(est.separateNetA, 0);
  assert.ok(est.assumptions.some((a) => /community presumption/i.test(a)));
});

test("negative community estate divides the net liability and flags it", () => {
  const items: PropertyItem[] = [
    { label: "Car", value: 10000, kind: "asset", characterization: "community" },
    { label: "Loans", value: 30000, kind: "debt", characterization: "community" },
  ];
  const est = dividePropertyEstate({ items });
  assert.equal(est.netCommunityEstate, -20000);
  assert.equal(est.communityAwardA, -10000);
  assert.equal(est.communityAwardB, -10000);
  assert.ok(est.assumptions.some((a) => /exceed/i.test(a)));
});

test("zero / non-finite values are ignored", () => {
  const items: PropertyItem[] = [
    { label: "Empty", value: 0, kind: "asset", characterization: "community" },
    { label: "Real", value: 1000, kind: "asset", characterization: "community" },
  ];
  const est = dividePropertyEstate({ items });
  assert.equal(est.communityAssets, 1000);
});

test("suggestCharacterization applies the § 3.001 rules and community presumption", () => {
  assert.equal(suggestCharacterization("before_marriage").characterization, "separate");
  assert.equal(suggestCharacterization("inheritance").characterization, "separate");
  assert.equal(suggestCharacterization("gift").characterization, "separate");
  assert.equal(suggestCharacterization("personal_injury_nonearnings").characterization, "separate");
  assert.equal(suggestCharacterization("during_marriage").characterization, "community");
  assert.ok(/3.003|presum/i.test(suggestCharacterization("during_marriage").rationale));
});

test("estimate-to-fact uses the stable label and carries the split + caveat", () => {
  const items: PropertyItem[] = [
    { label: "Home", value: 280000, kind: "asset", characterization: "community" },
  ];
  const est = dividePropertyEstate({ items });
  const fact = propertyDivisionToFact(est);
  assert.equal(fact.label, PROPERTY_DIVISION_FACT_LABEL);
  assert.ok(/50\/50/.test(fact.value));
  assert.ok(/estimate only/i.test(fact.value));
});

test("formatter produces a readable one-liner with both walk-away totals", () => {
  const items: PropertyItem[] = [
    { label: "Cash", value: 100000, kind: "asset", characterization: "community" },
  ];
  const line = formatPropertyDivisionEstimate(dividePropertyEstate({ items }));
  assert.ok(line.includes("$50,000"));
  assert.ok(/spouse A/i.test(line) && /spouse B/i.test(line));
});
