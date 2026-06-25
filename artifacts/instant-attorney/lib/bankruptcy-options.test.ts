import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEBT_OPTIONS,
  recommendDebtOptions,
  getDebtOption,
  debtOptionsDisclaimer,
} from "./bankruptcy-options.ts";
import { isKnownDebtStatuteKey } from "./debt-statutes.ts";
import { isKnownDebtInstrumentKey } from "./debt-instruments.ts";

test("every option has complete fields and resolvable references", () => {
  assert.ok(DEBT_OPTIONS.length >= 1);
  for (const o of DEBT_OPTIONS) {
    assert.ok(o.label && o.summary, `${o.key} core fields`);
    assert.ok(o.bestWhen.length > 0 && o.watchOut.length > 0, `${o.key} has best/watch`);
    for (const k of o.relevant_statutes) assert.ok(isKnownDebtStatuteKey(k), `${o.key} bad statute ${k}`);
    for (const k of o.relevant_instruments) assert.ok(isKnownDebtInstrumentKey(k), `${o.key} bad instrument ${k}`);
  }
});

test("default recommendation returns all options ordered canonically", () => {
  const r = recommendDebtOptions();
  assert.equal(r.length, DEBT_OPTIONS.length);
  assert.equal(r[0].key, "chapter_7");
  assert.ok(r.every((o) => o.fit && o.reason));
});

test("below median => Chapter 7 is a strong fit and sorts first", () => {
  const r = recommendDebtOptions({ belowMedian: true });
  assert.equal(r[0].key, "chapter_7");
  assert.equal(r[0].fit, "strong");
});

test("prior Chapter 7 within 8 years makes Chapter 7 unlikely", () => {
  const r = recommendDebtOptions({ priorCh7Within8yr: true, belowMedian: true });
  const ch7 = r.find((o) => o.key === "chapter_7")!;
  assert.equal(ch7.fit, "unlikely");
  assert.match(ch7.reason, /8 years/);
});

test("behind on a secured debt with income => Chapter 13 is a strong fit", () => {
  const r = recommendDebtOptions({ behindOnSecuredWantKeep: true, regularIncome: true });
  const ch13 = r.find((o) => o.key === "chapter_13")!;
  assert.equal(ch13.fit, "strong");
});

test("no income => Chapter 13 and a debt-management plan are unlikely", () => {
  const r = recommendDebtOptions({ regularIncome: false });
  assert.equal(r.find((o) => o.key === "chapter_13")!.fit, "unlikely");
  assert.equal(r.find((o) => o.key === "debt_management_plan")!.fit, "unlikely");
});

test("exempt assets + no income => judgment-proof is a strong fit", () => {
  const r = recommendDebtOptions({ assetsMostlyExempt: true, regularIncome: false });
  const jp = r.find((o) => o.key === "judgment_proof")!;
  assert.equal(jp.fit, "strong");
  // judgment-proof guidance must still tell them to answer a lawsuit
  assert.ok(jp.watchOut.some((w) => /answer a (suit|lawsuit)/i.test(w)));
});

test("strong fits always sort ahead of possible and unlikely", () => {
  const r = recommendDebtOptions({ belowMedian: true, regularIncome: false });
  const fits = r.map((o) => o.fit);
  const firstPossible = fits.indexOf("possible");
  const firstStrong = fits.indexOf("strong");
  assert.ok(firstStrong === 0);
  if (firstPossible !== -1) assert.ok(firstPossible > firstStrong);
});

test("lookup + disclaimer", () => {
  assert.equal(getDebtOption("chapter_13").label, "Chapter 13 (repayment plan)");
  assert.ok(debtOptionsDisclaimer().length > 0);
});
