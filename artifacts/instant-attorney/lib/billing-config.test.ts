import { test } from "node:test";
import assert from "node:assert/strict";
import {
  topUpMarginPct,
  thresholdForMargin,
  clampThresholdToMarginBand,
  stripeFeeUsd,
  TARGET_MARGIN_FLOOR,
  TARGET_MARGIN_CEIL,
} from "./billing-config.ts";

const EPS = 1e-6;

test("stripeFeeUsd is 2.9% + $0.30", () => {
  assert.ok(Math.abs(stripeFeeUsd(8.5) - (8.5 * 0.029 + 0.3)) < EPS);
  assert.ok(Math.abs(stripeFeeUsd(0) - 0.3) < EPS);
});

test("thresholdForMargin round-trips through topUpMarginPct", () => {
  for (const charge of [7.5, 8.5, 9.99]) {
    for (const m of [0.35, 0.42, 0.5]) {
      const threshold = thresholdForMargin(charge, m);
      assert.ok(
        Math.abs(topUpMarginPct(charge, threshold) - m) < 0.005,
        `charge ${charge} margin ${m} -> threshold ${threshold}`
      );
    }
  }
});

test("higher threshold means lower margin (monotonic)", () => {
  const charge = 8.5;
  assert.ok(topUpMarginPct(charge, 3.0) > topUpMarginPct(charge, 5.0));
});

test("in-band threshold is respected exactly (no clamp) at $8.50", () => {
  // $8.50 @ $4.75 is ≈37.7% — inside 35–50%, so it must pass through untouched.
  const r = clampThresholdToMarginBand(8.5, 4.75);
  assert.equal(r.clamped, false);
  assert.equal(r.thresholdUsd, 4.75);
  assert.ok(r.marginPct >= TARGET_MARGIN_FLOOR && r.marginPct <= TARGET_MARGIN_CEIL);
});

test("too-high threshold is pulled down to the 35% floor edge (lower price)", () => {
  // If the live charge is $7.50, $4.75 would be ≈29.8% — below the floor.
  const r = clampThresholdToMarginBand(7.5, 4.75);
  assert.equal(r.clamped, true);
  assert.ok(r.thresholdUsd < 4.75);
  // Landed at (or just inside) the 35% floor — never below it.
  assert.ok(r.marginPct >= TARGET_MARGIN_FLOOR - 0.005);
  assert.ok(r.marginPct <= TARGET_MARGIN_CEIL);
});

test("too-low threshold is pulled up to the 50% ceiling edge", () => {
  // A tiny threshold would over-deliver margin (>50%); clamp up to the ceiling.
  const r = clampThresholdToMarginBand(8.5, 1.0);
  assert.equal(r.clamped, true);
  assert.ok(r.thresholdUsd > 1.0);
  assert.ok(r.marginPct <= TARGET_MARGIN_CEIL + 0.005);
  assert.ok(r.marginPct >= TARGET_MARGIN_FLOOR);
});

test("clamped threshold always yields a margin inside the band, across charges", () => {
  for (const charge of [6, 7.5, 8.5, 9.99, 12]) {
    for (const threshold of [0.5, 2, 4.75, 6, 9]) {
      const r = clampThresholdToMarginBand(charge, threshold);
      assert.ok(
        r.marginPct >= TARGET_MARGIN_FLOOR - 0.005 && r.marginPct <= TARGET_MARGIN_CEIL + 0.005,
        `charge ${charge} threshold ${threshold} -> margin ${r.marginPct}`
      );
    }
  }
});
