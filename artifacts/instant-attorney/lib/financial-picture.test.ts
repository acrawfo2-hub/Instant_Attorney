import { test } from "node:test";
import assert from "node:assert/strict";
import {
  summarizeFinancialPicture,
  validateFinancialItemInput,
  maxVerificationFor,
  verificationExceedsCeiling,
  partnerReportOnly,
  allowedPartnerRoles,
  requiresNoSecretsAck,
  categoryKind,
  FINANCIAL_DISCLOSURE_STANDARD,
  CATEGORY_OPTIONS,
} from "./financial-picture.ts";
import type { FinancialItem } from "./types.ts";

function item(over: Partial<FinancialItem>): FinancialItem {
  return {
    id: Math.random().toString(36).slice(2),
    case_file_id: "c1",
    user_id: "u1",
    category: "financial_account",
    label: "Account",
    acquisition_note: null,
    owner: "client",
    characterization: "community",
    exempt_status: "unknown",
    value_low: 0,
    value_high: 0,
    value_basis: "client_estimate",
    valued_as_of: null,
    provenance: "client_asserted",
    verification_status: "unverified",
    source_attachment_id: null,
    phase_collected: "phase_2_privileged",
    privileged: true,
    red_flags: [],
    needs_attorney_review: false,
    status: "active",
    superseded_by: null,
    created_at: "2026-01-01",
    ...over,
  };
}

test("every category has a kind, and the catalog covers assets, debts, income, expenses", () => {
  const kinds = new Set(CATEGORY_OPTIONS.map((o) => o.kind));
  for (const k of ["asset", "debt", "income", "expense"]) assert.ok(kinds.has(k as never), `missing ${k}`);
  assert.equal(categoryKind("secured_debt"), "debt");
  assert.equal(categoryKind("real_property"), "asset");
});

test("summary nets debts against assets using interval arithmetic", () => {
  const items = [
    item({ category: "real_property", value_low: 200000, value_high: 250000, characterization: "community" }),
    item({ category: "secured_debt", value_low: 150000, value_high: 150000 }),
    item({ category: "financial_account", value_low: 8000, value_high: 8000, characterization: "separate_client" }),
  ];
  const s = summarizeFinancialPicture(items);
  assert.deepEqual(s.assets, { low: 208000, high: 258000 });
  assert.deepEqual(s.debts, { low: 150000, high: 150000 });
  // net low = assetsLow - debtsHigh; net high = assetsHigh - debtsLow
  assert.deepEqual(s.net, { low: 58000, high: 108000 });
  assert.deepEqual(s.byCharacterization.community, { low: 200000, high: 250000 });
  assert.deepEqual(s.byCharacterization.separate_client, { low: 8000, high: 8000 });
});

test("summary ignores removed/superseded items and tallies ownership", () => {
  const items = [
    item({ category: "vehicle", value_low: 10000, value_high: 10000, owner: "joint" }),
    item({ category: "vehicle", value_low: 99999, value_high: 99999, status: "removed" }),
  ];
  const s = summarizeFinancialPicture(items);
  assert.deepEqual(s.assets, { low: 10000, high: 10000 });
  assert.equal(s.counts.total, 1);
  assert.equal(s.counts.byOwner.joint, 1);
});

test("verification health: percent supported counts doc + attorney verified", () => {
  const items = [
    item({ verification_status: "unverified" }),
    item({ verification_status: "doc_supported" }),
    item({ verification_status: "attorney_verified" }),
    item({ verification_status: "doc_supported" }),
  ];
  const s = summarizeFinancialPicture(items);
  assert.equal(s.verification.asserted, 1);
  assert.equal(s.verification.docSupported, 2);
  assert.equal(s.verification.attorneyVerified, 1);
  assert.equal(s.verification.percentSupported, 75);
});

test("red flags and needs-review are counted for the attorney queue", () => {
  const items = [
    item({ needs_attorney_review: true, red_flags: [{ code: "x", severity: "warn", message: "m" }] }),
    item({}),
  ];
  const s = summarizeFinancialPicture(items);
  assert.equal(s.needsReviewCount, 1);
  assert.equal(s.redFlagCount, 1);
});

test("partner guard: an adverse partner's asset can never exceed 'unverified' from client input", () => {
  assert.ok(partnerReportOnly("adverse_party"));
  assert.ok(partnerReportOnly("non_client_third_party"));
  assert.ok(!partnerReportOnly("joint_client"));

  assert.equal(maxVerificationFor("partner", "adverse_party"), "unverified");
  assert.equal(maxVerificationFor("other_third_party", "non_client_third_party"), "unverified");
  // A joint client's data, or the client's own, can be fully verified.
  assert.equal(maxVerificationFor("partner", "joint_client"), "attorney_verified");
  assert.equal(maxVerificationFor("client", "adverse_party"), "attorney_verified");

  assert.ok(verificationExceedsCeiling("attorney_verified", "partner", "adverse_party"));
  assert.ok(!verificationExceedsCeiling("unverified", "partner", "adverse_party"));
});

test("representation rules: family law forbids a joint-client partner; joint scope needs no-secrets ack", () => {
  const fam = allowedPartnerRoles(true);
  assert.ok(!fam.includes("joint_client"));
  assert.ok(fam.includes("adverse_party"));
  const estate = allowedPartnerRoles(false);
  assert.ok(estate.includes("joint_client"));

  assert.ok(requiresNoSecretsAck("joint_spouses", "joint_client"));
  assert.ok(!requiresNoSecretsAck("single_client", "adverse_party"));
});

test("validation catches the common mistakes and accepts a good item", () => {
  assert.deepEqual(validateFinancialItemInput({ category: "vehicle", label: "Truck", value_low: 5000, value_high: 7000 }), []);
  const errs = validateFinancialItemInput({ category: "not_a_thing", label: "", value_low: 9000, value_high: 1000 });
  assert.ok(errs.some((e) => /kind of item/i.test(e)));
  assert.ok(errs.some((e) => /description/i.test(e)));
  assert.ok(errs.some((e) => /low value can't be greater/i.test(e)));
  assert.ok(validateFinancialItemInput({ category: "vehicle", label: "x", valued_as_of: "not-a-date" }).some((e) => /valid date/i.test(e)));
});

test("the disclosure standard covers honesty, no-concealment, verification, the partner, and privilege", () => {
  const text = (FINANCIAL_DISCLOSURE_STANDARD.intro + " " + FINANCIAL_DISCLOSURE_STANDARD.points.map((p) => p.heading + " " + p.body).join(" ")).toLowerCase();
  assert.ok(FINANCIAL_DISCLOSURE_STANDARD.points.length >= 4);
  assert.match(text, /honest|full/);
  assert.match(text, /hide|conceal|undervalue/);
  assert.match(text, /verif/);
  assert.match(text, /partner|spouse/);
  assert.match(text, /privile/);
  assert.ok(FINANCIAL_DISCLOSURE_STANDARD.acknowledgment.length > 0);
});
