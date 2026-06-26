import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TAX_SITUATIONS,
  taxGuidanceFor,
  isKnownTaxSituation,
  matchTaxSituation,
} from "./tax-guidance.ts";
import { isKnownTaxStatuteKey } from "./tax-statutes.ts";
import { isKnownTaxInstrumentKey } from "./tax-instruments.ts";

test("every situation has rights, actions, cautions, and resolvable references", () => {
  assert.ok(TAX_SITUATIONS.length >= 1);
  for (const { situation } of TAX_SITUATIONS) {
    const g = taxGuidanceFor(situation);
    assert.ok(g.label && g.blurb && g.disclaimer, `${situation} core fields`);
    assert.ok(g.rights.length > 0, `${situation} has rights`);
    assert.ok(g.actions.length > 0, `${situation} has actions`);
    assert.ok(g.cautions.length > 0, `${situation} has cautions`);
    assert.match(g.disclaimer, /not.*prepare|does not prepare/i, `${situation} disclaimer scopes away return prep`);
    for (const k of g.relevant_statutes) assert.ok(isKnownTaxStatuteKey(k), `${situation} unknown statute ${k}`);
    for (const k of g.relevant_instruments) assert.ok(isKnownTaxInstrumentKey(k), `${situation} unknown instrument ${k}`);
  }
});

test("levy-threat guidance is urgent and points at CDP instrument", () => {
  const g = taxGuidanceFor("levy_threat");
  assert.ok(g.actions.some((a) => a.urgent), "has an urgent action");
  assert.ok(g.relevant_instruments.includes("collection_due_process_request"));
  assert.ok(g.cautions.some((c) => /final notice/i.test(c)));
});

test("irs-notice guidance warns against ignoring the notice", () => {
  const g = taxGuidanceFor("irs_notice");
  assert.ok(g.cautions.some((c) => /ignore/i.test(c)));
  assert.ok(g.relevant_statutes.includes("irs-notice-response"));
});

test("membership + situation matching (most-urgent wins)", () => {
  assert.ok(isKnownTaxSituation("audit"));
  assert.ok(!isKnownTaxSituation("nope"));
  assert.equal(matchTaxSituation("I received a Final Notice of Intent to Levy"), "levy_threat");
  assert.equal(matchTaxSituation("someone filed a fraudulent return with my SSN"), "tax_identity_theft");
  assert.equal(matchTaxSituation("the IRS is auditing my return"), "audit");
  assert.equal(matchTaxSituation("I owe back taxes and need a payment plan"), "behind_on_taxes");
  assert.equal(matchTaxSituation("I got a CP2000 notice"), "irs_notice");
  assert.equal(matchTaxSituation(""), null);
  assert.equal(matchTaxSituation(null), null);
});

test("TAX_SITUATIONS is a stable, ordered menu", () => {
  assert.equal(TAX_SITUATIONS[0].situation, "irs_notice");
  assert.equal(new Set(TAX_SITUATIONS.map((s) => s.situation)).size, TAX_SITUATIONS.length);
});
