import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIEN_STATUTES,
  getLienStatute,
  isKnownLienStatuteKey,
  lienStatutesForPrompt,
  matchLienStatutesByText,
  lienImpactGuideForPrompt,
} from "./lien-statutes.ts";

test("registry is non-empty and every statute cites an official source", () => {
  assert.ok(LIEN_STATUTES.length >= 10);
  for (const s of LIEN_STATUTES) {
    assert.ok(s.official_url.startsWith("https://"), `${s.key} url`);
    assert.ok(s.code && s.topic && s.summary && s.owner_right, `${s.key} core fields`);
    assert.ok(s.triggers.length > 0, `${s.key} has triggers`);
    assert.ok(["Federal", "Texas"].includes(s.jurisdiction), `${s.key} jurisdiction`);
  }
});

test("statute keys are unique", () => {
  const keys = LIEN_STATUTES.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("lookup + key membership helpers", () => {
  assert.ok(isKnownLienStatuteKey("tx-53-right-to-lien"));
  assert.ok(!isKnownLienStatuteKey("totally-made-up"));
  assert.equal(getLienStatute("tx-51-foreclosure-notice")?.code, "Tex. Prop. Code § 51.002");
  assert.equal(getLienStatute("nope"), undefined);
});

test("prompt catalog lists every key", () => {
  const catalog = lienStatutesForPrompt();
  for (const s of LIEN_STATUTES) {
    assert.ok(catalog.includes(s.key), `catalog missing ${s.key}`);
  }
});

test("impact guide covers major lien categories", () => {
  const guide = lienImpactGuideForPrompt();
  assert.ok(guide.includes("Mechanic"));
  assert.ok(guide.includes("Judgment"));
  assert.ok(guide.includes("Mortgage"));
  assert.ok(guide.includes("Homestead"));
});

test("offline keyword fallback catches obvious lien situations", () => {
  const mech = matchLienStatutesByText("A contractor filed a mechanic's lien on my house").map(
    (s) => s.key
  );
  assert.ok(mech.includes("tx-53-right-to-lien"));

  const foreclosure = matchLienStatutesByText("I got a notice of sale for foreclosure next month").map(
    (s) => s.key
  );
  assert.ok(foreclosure.includes("tx-51-foreclosure-notice"));

  const homestead = matchLienStatutesByText("Can they put a judgment lien on my homestead?").map(
    (s) => s.key
  );
  assert.ok(homestead.includes("tx-52-homestead-exception"));

  const title = matchLienStatutesByText("The title commitment has a Schedule B exception").map(
    (s) => s.key
  );
  assert.ok(title.includes("tx-title-recording"));
});
