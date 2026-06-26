import { test } from "node:test";
import assert from "node:assert/strict";
import {
  detectFinancialArea,
  scheduleForArea,
  detectGaps,
  type FinancialMatterArea,
} from "./financial-schedules.ts";
import type { FinancialItem, FinancialCategory } from "./types.ts";

function item(category: FinancialCategory, over: Partial<FinancialItem> = {}): FinancialItem {
  return {
    id: Math.random().toString(36).slice(2),
    case_file_id: "c1", user_id: "u1",
    category, label: category, acquisition_note: null,
    owner: "client", characterization: "mixed_or_unknown", exempt_status: "unknown",
    value_low: 0, value_high: 0, value_basis: "client_estimate", valued_as_of: null,
    provenance: "client_asserted", verification_status: "unverified", source_attachment_id: null,
    phase_collected: "phase_2_privileged", privileged: true, red_flags: [],
    needs_attorney_review: false, status: "active", superseded_by: null, created_at: "2026-01-01",
    ...over,
  };
}

test("area detection from matter text", () => {
  assert.equal(detectFinancialArea("chapter 7 bankruptcy means test"), "bankruptcy");
  assert.equal(detectFinancialArea("divorce with child custody"), "family");
  assert.equal(detectFinancialArea("estate planning and a living trust"), "estate");
  assert.equal(detectFinancialArea("a contract dispute"), "general");
});

test("bankruptcy schedule includes income and expenses as required buckets", () => {
  const s = scheduleForArea("bankruptcy");
  const keys = s.map((b) => b.key);
  assert.ok(keys.includes("income"));
  assert.ok(keys.includes("expenses"));
  assert.ok(s.find((b) => b.key === "unsecured_debt")?.required);
});

test("empty picture reports every bucket as a gap, required ones first", () => {
  const r = detectGaps("bankruptcy", []);
  assert.ok(r.gaps.length === scheduleForArea("bankruptcy").length);
  // required gaps sort ahead of optional ones
  const firstOptionalIdx = r.gaps.findIndex((g) => !g.required);
  const lastRequiredIdx = r.gaps.map((g) => g.required).lastIndexOf(true);
  if (firstOptionalIdx !== -1) assert.ok(lastRequiredIdx < firstOptionalIdx);
  assert.equal(r.requiredCovered, 0);
  assert.ok(r.requiredTotal > 0);
});

test("adding items closes their buckets and advances required coverage", () => {
  const items = [item("real_property"), item("financial_account"), item("unsecured_debt"), item("income_source"), item("recurring_expense"), item("retirement_account"), item("secured_debt")];
  const r = detectGaps("bankruptcy", items);
  assert.ok(!r.gaps.some((g) => g.key === "income"));
  assert.ok(!r.gaps.some((g) => g.key === "unsecured_debt"));
  assert.equal(r.requiredCovered, r.requiredTotal);
});

test("cross-inference: a secured debt with no home or vehicle is flagged", () => {
  const r = detectGaps("family", [item("secured_debt")]);
  assert.ok(r.inferences.some((i) => /home or vehicle/i.test(i.message)));
});

test("cross-inference: bankruptcy income without expenses is flagged", () => {
  const r = detectGaps("bankruptcy", [item("income_source")]);
  assert.ok(r.inferences.some((i) => /Schedule J|expenses/i.test(i.message)));
});

test("cross-inference: an unfamiliar home characterization prompts a tracing note (non-bankruptcy)", () => {
  const r = detectGaps("family", [item("real_property", { characterization: "mixed_or_unknown" })]);
  assert.ok(r.inferences.some((i) => /community or separate|acquired/i.test(i.message)));
});

test("removed items don't count as covering a bucket", () => {
  const r = detectGaps("general", [item("financial_account", { status: "removed" })]);
  assert.ok(r.gaps.some((g) => g.key === "accounts"));
});
