import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEBT_SITUATIONS,
  debtRightsFor,
  isKnownDebtSituation,
  matchDebtSituation,
} from "./debt-collection-rights.ts";
import { isKnownDebtStatuteKey } from "./debt-statutes.ts";
import { isKnownDebtInstrumentKey } from "./debt-instruments.ts";

test("every situation has rights, actions, cautions, and resolvable references", () => {
  assert.ok(DEBT_SITUATIONS.length >= 1);
  for (const { situation } of DEBT_SITUATIONS) {
    const g = debtRightsFor(situation);
    assert.ok(g.label && g.blurb && g.disclaimer, `${situation} core fields`);
    assert.ok(g.rights.length > 0, `${situation} has rights`);
    assert.ok(g.actions.length > 0, `${situation} has actions`);
    assert.ok(g.cautions.length > 0, `${situation} has cautions`);
    for (const k of g.relevant_statutes) assert.ok(isKnownDebtStatuteKey(k), `${situation} unknown statute ${k}`);
    for (const k of g.relevant_instruments) assert.ok(isKnownDebtInstrumentKey(k), `${situation} unknown instrument ${k}`);
  }
});

test("being-sued guidance is urgent and points at the answer instrument", () => {
  const g = debtRightsFor("being_sued");
  assert.ok(g.actions.some((a) => a.urgent), "has an urgent action");
  assert.ok(g.relevant_instruments.includes("answer_to_debt_suit"));
  assert.ok(g.cautions.some((c) => /default judgment/i.test(c)));
});

test("time-barred guidance warns against restarting the clock", () => {
  const g = debtRightsFor("time_barred");
  assert.ok(g.cautions.some((c) => /restart/i.test(c) && /clock/i.test(c)));
  assert.ok(g.relevant_statutes.includes("tx-limitations-debt"));
});

test("membership + situation matching (most-urgent wins)", () => {
  assert.ok(isKnownDebtSituation("harassment"));
  assert.ok(!isKnownDebtSituation("nope"));
  assert.equal(matchDebtSituation("I was served with a lawsuit"), "being_sued");
  assert.equal(matchDebtSituation("they threatened to garnish my wages"), "garnishment_threat");
  assert.equal(matchDebtSituation("a debt collector keeps calling constantly"), "harassment");
  assert.equal(matchDebtSituation("there's a wrong account on my credit report"), "credit_report_error");
  assert.equal(matchDebtSituation(""), null);
  assert.equal(matchDebtSituation(null), null);
});

test("DEBT_SITUATIONS is a stable, ordered menu", () => {
  assert.equal(DEBT_SITUATIONS[0].situation, "first_contact");
  assert.equal(new Set(DEBT_SITUATIONS.map((s) => s.situation)).size, DEBT_SITUATIONS.length);
});
