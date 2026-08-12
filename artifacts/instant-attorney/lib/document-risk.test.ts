import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildJurisdictionBlock, classifyInstrumentRisk, hasConfirmedForum, hasRequiredForum } from "./document-risk.ts";

test("an unconfirmed-jurisdiction ordinary letter may be drafted neutrally", () => {
  const profile = classifyInstrumentRisk("general_document", "Client status letter");
  assert.equal(profile.risk, "low");
  assert.equal(profile.permitsJurisdictionNeutralDraft, true);
  assert.equal(hasConfirmedForum("Unconfirmed"), false);
});

for (const scenario of [
  { name: "complaint", type: "general_document" as const, instrument: "Civil complaint", missing: "court" },
  { name: "will", type: "wills_trusts" as const, instrument: "Last will and testament", missing: "jurisdiction" },
  { name: "trust", type: "general_document" as const, instrument: "Revocable living trust", missing: "jurisdiction" },
  { name: "FOIA/open-records request", type: "general_document" as const, instrument: "FOIA open-records request", missing: "agency" },
]) {
  test(`an unconfirmed-jurisdiction ${scenario.name} returns a structured block`, () => {
    const profile = classifyInstrumentRisk(scenario.type, scenario.instrument);
    assert.equal(profile.risk, "high");
    assert.equal(profile.permitsJurisdictionNeutralDraft, false);
    const block = buildJurisdictionBlock(profile);
    assert.equal(block.code, "MISSING_GOVERNING_FORUM");
    assert.equal(block.missing, scenario.missing);
    assert.equal(hasRequiredForum(profile, "Texas"), scenario.missing === "jurisdiction");
  });
}

test("the drafter prompt still refuses to assume a jurisdiction", () => {
  // This used to also assert the wizard route's 409 and the wizard page's
  // "confirm the forum before we draft" screen. Both are gone: the forum gate
  // no longer refuses. It shapes the draft instead — see document-drafting.ts —
  // so the client gets the document with the forum written as a BLOCKING
  // placeholder rather than getting nothing.
  //
  // What has NOT changed, and is what this pins, is that the model may not pick
  // a jurisdiction for itself.
  const prompt = readFileSync(new URL("./prompts.ts", import.meta.url), "utf8");

  // This used to assert one exact phrasing — "draft for Texas as the working
  // jurisdiction" — and so it sailed past the two Living File templates that
  // told the model to write `JURISDICTION: Unconfirmed — defaulting to Texas`.
  // That string is parsed into case_files.jurisdiction, and hasConfirmedForum
  // was anchored, so it read as a CONFIRMED forum: the gate was defeated by
  // prompt text, and a high-risk instrument drafted under Texas law nobody
  // confirmed. Match the intent instead of a sentence.
  const defaultsAForum = /default(?:ing|s)?\s+(?:the\s+\w+\s+)?(?:to\s+)?(?:Texas|[A-Z][a-z]+)\b/g;
  const offending = [...prompt.matchAll(defaultsAForum)]
    .map((m) => m[0])
    // The one legitimate use: an instruction NOT to do it.
    .filter((phrase) => !/do NOT default/i.test(prompt.slice(Math.max(0, prompt.indexOf(phrase) - 40), prompt.indexOf(phrase) + phrase.length)));
  assert.deepEqual(
    offending,
    [],
    `lib/prompts.ts tells the model to default a jurisdiction. Whatever it writes ` +
      `on the Living File JURISDICTION line is parsed into case_files.jurisdiction ` +
      `and then read by the forum gate, so a defaulted forum is indistinguishable ` +
      `from a confirmed one: ${offending.join(", ")}`
  );

  assert.match(prompt, /DOCUMENT RISK/);
  assert.match(prompt, /MISSING_GOVERNING_FORUM/);

  const engine = readFileSync(new URL("./document-drafting.ts", import.meta.url), "utf8");
  assert.match(engine, /must NOT name, assume, or imply/);
  assert.match(engine, /FORUM_PLACEHOLDER/);
});
