import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PI_SITUATIONS,
  piClaimGuideFor,
  isKnownPiSituation,
  matchPiSituation,
} from "./pi-claim-guide.ts";
import { isKnownPiInstrumentKey } from "./pi-instruments.ts";
import { isKnownPiStatuteKey } from "./pi-statutes.ts";

test("all situations have complete guidance", () => {
  assert.ok(PI_SITUATIONS.length >= 5);
  for (const s of PI_SITUATIONS) {
    const g = piClaimGuideFor(s.situation);
    assert.ok(g.rights.length > 0, `${s.situation} rights`);
    assert.ok(g.actions.length > 0, `${s.situation} actions`);
    assert.ok(g.cautions.length > 0, `${s.situation} cautions`);
    for (const key of g.relevant_statutes) assert.ok(isKnownPiStatuteKey(key), `${s.situation} statute ${key}`);
    for (const key of g.relevant_instruments) assert.ok(isKnownPiInstrumentKey(key), `${s.situation} instrument ${key}`);
  }
});

test("isKnownPiSituation", () => {
  assert.ok(isKnownPiSituation("just_happened"));
  assert.ok(!isKnownPiSituation("nope"));
});

test("matchPiSituation prioritizes urgent situations", () => {
  assert.equal(matchPiSituation("wrongful death in a car crash"), "wrongful_death");
  assert.equal(matchPiSituation("medical malpractice by surgeon"), "medical_malpractice");
  assert.equal(matchPiSituation("insurance adjuster wants recorded statement"), "dealing_with_insurer");
});
