import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanFreshness,
  suggestReviewAfter,
  formatFreshnessReport,
  parseISODate,
  type FreshnessItem,
} from "./scan.ts";

function item(over: Partial<FreshnessItem> & { id: string; reviewAfter: string }): FreshnessItem {
  return {
    label: over.label ?? over.id,
    area: over.area ?? "test",
    volatility: over.volatility ?? "statute",
    currentValue: over.currentValue ?? "value",
    sourceUrl: over.sourceUrl ?? "https://example.gov",
    verifiedOn: over.verifiedOn ?? "2026-01-01",
    ...over,
  };
}

test("scan buckets items into overdue / dueSoon / ok by reviewAfter", () => {
  const items = [
    item({ id: "past", reviewAfter: "2026-01-01" }),
    item({ id: "soon", reviewAfter: "2026-07-01" }),
    item({ id: "later", reviewAfter: "2027-01-01" }),
  ];
  const res = scanFreshness(items, "2026-06-24", 60);
  assert.deepEqual(res.overdue.map((i) => i.id), ["past"]);
  assert.deepEqual(res.dueSoon.map((i) => i.id), ["soon"]); // within 60 days
  assert.deepEqual(res.ok.map((i) => i.id), ["later"]);
});

test("daysUntilReview is negative when overdue, positive otherwise", () => {
  const res = scanFreshness(
    [item({ id: "a", reviewAfter: "2026-06-20" }), item({ id: "b", reviewAfter: "2026-06-30" })],
    "2026-06-24"
  );
  assert.equal(res.overdue[0].daysUntilReview, -4);
  assert.equal(res.ok.concat(res.dueSoon).find((i) => i.id === "b")!.daysUntilReview, 6);
});

test("a malformed reviewAfter is treated as overdue (fails loud, not silent)", () => {
  const res = scanFreshness([item({ id: "bad", reviewAfter: "not-a-date" })], "2026-06-24");
  assert.equal(res.overdue.length, 1);
  assert.equal(res.overdue[0].id, "bad");
});

test("buckets are sorted by reviewAfter ascending", () => {
  const res = scanFreshness(
    [
      item({ id: "z", reviewAfter: "2030-01-01" }),
      item({ id: "a", reviewAfter: "2028-01-01" }),
      item({ id: "m", reviewAfter: "2029-01-01" }),
    ],
    "2026-06-24"
  );
  assert.deepEqual(res.ok.map((i) => i.id), ["a", "m", "z"]);
});

test("suggestReviewAfter applies per-volatility intervals and clamps to a known change", () => {
  // indexed-dollar -> +12 months
  assert.equal(suggestReviewAfter("2026-06-24", "indexed-dollar"), "2027-06-24");
  // statute -> +24 months
  assert.equal(suggestReviewAfter("2026-06-24", "statute"), "2028-06-24");
  // clamps to a sooner known change
  assert.equal(
    suggestReviewAfter("2026-06-24", "statute", "2027-09-01"),
    "2027-09-01"
  );
  // a later known change does not override the interval
  assert.equal(
    suggestReviewAfter("2026-06-24", "indexed-dollar", "2031-09-01"),
    "2027-06-24"
  );
});

test("report names overdue items and their sources", () => {
  const res = scanFreshness([item({ id: "x", label: "The Cap", reviewAfter: "2025-01-01", sourceUrl: "https://oag.gov/cap" })], "2026-06-24");
  const md = formatFreshnessReport(res);
  assert.match(md, /Legal data freshness/);
  assert.match(md, /Overdue/);
  assert.match(md, /The Cap/);
  assert.match(md, /https:\/\/oag\.gov\/cap/);
});

test("report shows the all-clear when nothing is due", () => {
  const res = scanFreshness([item({ id: "ok", reviewAfter: "2099-01-01" })], "2026-06-24");
  const md = formatFreshnessReport(res);
  assert.match(md, /All tracked legal data is current/);
});

test("parseISODate rejects malformed and impossible dates", () => {
  assert.ok(parseISODate("2026-06-24"));
  assert.equal(parseISODate("2026-13-01"), null);
  assert.equal(parseISODate("2026-02-31"), null);
  assert.equal(parseISODate("nope"), null);
  assert.equal(parseISODate(null), null);
});
