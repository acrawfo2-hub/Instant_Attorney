import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkExemptions,
  exemptionsToFact,
  ASSET_CATEGORIES,
  TX_EXEMPTION_CAP,
  EXEMPTIONS_FACT_LABEL,
  type ExemptionAsset,
} from "./bankruptcy-exemptions.ts";

test("typical Texas filer keeps everything", () => {
  const assets: ExemptionAsset[] = [
    { category: "homestead", value: 250000 },
    { category: "vehicle", value: 15000 },
    { category: "household_goods", value: 8000 },
    { category: "retirement", value: 60000 },
    { category: "wages", value: 4000 },
  ];
  const r = checkExemptions(assets, false);
  assert.equal(r.keepsEverything, true);
  assert.equal(r.totalAtRisk, 0);
  // homestead, retirement, wages are exempt independent of the cap
  assert.equal(r.assets.find((a) => a.category === "homestead")!.status, "exempt");
  assert.equal(r.assets.find((a) => a.category === "retirement")!.status, "exempt");
});

test("capped property over the cap puts the overflow at risk", () => {
  // family cap 100k; covered personal property = 130k -> 30k over
  const assets: ExemptionAsset[] = [
    { category: "household_goods", value: 70000 },
    { category: "vehicle", value: 60000 },
  ];
  const r = checkExemptions(assets, false);
  assert.equal(r.cap, 100000);
  assert.equal(r.cappedEligibleTotal, 130000);
  assert.equal(r.cappedExempt, 100000);
  assert.equal(r.totalAtRisk, 30000);
  assert.ok(r.assumptions.some((a) => /exceeds/i.test(a)));
});

test("single-adult cap is $50k", () => {
  const r = checkExemptions([{ category: "household_goods", value: 60000 }], true);
  assert.equal(r.cap, 50000);
  assert.equal(r.totalAtRisk, 10000);
});

test("jewelry above 25% of the cap is partly at risk", () => {
  // family cap 100k -> jewelry sublimit 25k; 40k jewelry -> 15k excess at risk
  const r = checkExemptions([{ category: "jewelry", value: 40000 }], false);
  assert.equal(r.totalAtRisk, 15000);
  assert.ok(r.assumptions.some((a) => /jewelry/i.test(a)));
  assert.equal(r.assets[0].status, "capped");
});

test("cash and other non-exempt property are flagged at risk", () => {
  const r = checkExemptions(
    [
      { category: "cash_bank", value: 5000 },
      { category: "other_nonexempt", value: 20000 },
    ],
    false
  );
  assert.equal(r.totalAtRisk, 25000);
  assert.ok(r.assets.every((a) => a.status === "at_risk"));
  assert.ok(r.assets.find((a) => a.category === "cash_bank")!.note.match(/not exempt/i));
});

test("zero / invalid values are ignored", () => {
  const r = checkExemptions(
    [
      { category: "vehicle", value: 0 },
      { category: "household_goods", value: 1000 },
    ],
    false
  );
  assert.equal(r.totalValue, 1000);
  assert.equal(r.assets.length, 1);
});

test("the personal-property cap matches the documented figures", () => {
  assert.equal(TX_EXEMPTION_CAP.family, 100000);
  assert.equal(TX_EXEMPTION_CAP.single, 50000);
});

test("fact reflects the verdict; category catalog is complete", () => {
  const keep = checkExemptions([{ category: "homestead", value: 200000 }], false);
  const fact = exemptionsToFact(keep);
  assert.equal(fact.label, EXEMPTIONS_FACT_LABEL);
  assert.match(fact.value, /keep everything/i);

  const risk = checkExemptions([{ category: "cash_bank", value: 9000 }], true);
  assert.match(exemptionsToFact(risk).value, /at risk/i);

  assert.ok(ASSET_CATEGORIES.length >= 10);
  assert.ok(ASSET_CATEGORIES.every((c) => c.category && c.label));
});
