import { test } from "node:test";
import assert from "node:assert/strict";
import * as placeholderParsing from "./placeholder-parsing.ts";
import {
  parseDrafterResponse,
  extractPlaceholders,
  placeholderFields,
  applyPlaceholderAnswers,
  humanizeLabel,
} from "./placeholder-parsing.ts";

/**
 * These tests cover the [[placeholder]] convention, which is how the product
 * keeps its second promise: every drafting request produces a complete, visible,
 * editable artifact, and unknown facts become unmistakable blanks rather than an
 * abandoned draft.
 *
 * The previous version of this file had it backwards. Twenty-one tests covered a
 * guided-checklist flow that belonged to the retired wizard page and had no
 * caller left — buildNeededItems, buildFallbackTemplate, buildStarterItems,
 * mapAnswersToPlaceholders — while the four functions the live UI actually calls
 * had almost no coverage at all. A suite can be large, green, and pointed at the
 * wrong half of the module.
 */

// ── The export surface ───────────────────────────────────────────────────────
// Pinned for the same reason lib/doc-generator.test.ts pins its own: this module
// grew a whole second flow once already, and it grew by addition, not by anyone
// deciding to add it.

const EXPECTED_EXPORTS = [
  "parseDrafterResponse", // ---DRAFT READY--- envelope → draft text + stated needs
  "extractPlaceholders", //  raw [[...]] occurrences, deduped, in document order
  "placeholderFields", //    those as labeled fields carrying `required`
  "applyPlaceholderAnswers", // fill blanks by key, touch nothing else
  "humanizeLabel", //        "FULL LEGAL NAME" → "Full Legal Name"
];

test("placeholder-parsing exposes only the convention", () => {
  assert.deepEqual(
    Object.keys(placeholderParsing).sort(),
    [...EXPECTED_EXPORTS].sort(),
    "This module is the [[placeholder]] convention and nothing else. A checklist " +
      "builder, a fallback template, or a starter-question set living here is how " +
      "it absorbed the wizard page's flow last time. If an export genuinely " +
      "belongs, add it to EXPECTED_EXPORTS with a line saying what it is.",
  );
});

// ── required: the flag the forum gate depends on ─────────────────────────────

test("a plain placeholder is required", () => {
  const [field] = placeholderFields("Payment of [[AMOUNT OWED — the principal sum]] is due.");
  assert.equal(field.required, true);
  assert.equal(field.label, "Amount Owed");
  assert.equal(field.hint, "the principal sum");
});

test("NON-BLOCKING in the descriptor makes a placeholder optional", () => {
  const [field] = placeholderFields(
    "Reference [[MATTER NUMBER — NON-BLOCKING: your internal file reference]].",
  );
  assert.equal(field.required, false);
  assert.equal(
    /BLOCKING/i.test(field.hint),
    false,
    "internal BLOCKING bookkeeping must not reach the client-facing hint",
  );
});

test("a BLOCKING forum placeholder is surfaced as required", () => {
  // The shape lib/document-drafting.ts writes when no governing forum is known.
  // If this ever came back optional, an unestablished jurisdiction would stop
  // being asked about, which is the failure the risk gate exists to prevent.
  const forum =
    "[[GOVERNING COURT OR JURISDICTION — BLOCKING: which state's law governs this, " +
    "and which court or agency it is for]]";
  const [field] = placeholderFields(`This agreement is governed by ${forum}.`);
  assert.equal(field.required, true);
  assert.equal(field.label, "Governing Court Or Jurisdiction");
});

// ── Identity-bearing placeholders must not collapse ──────────────────────────

test("placeholders sharing a head descriptor stay distinct", () => {
  const draft = "Between [[FULL LEGAL NAME — Party A]] and [[FULL LEGAL NAME — Party B]].";
  const fields = placeholderFields(draft);
  assert.equal(fields.length, 2, "Party A and Party B are different blanks");
  assert.notEqual(fields[0].key, fields[1].key);
});

test("the same placeholder repeated is asked for once", () => {
  const draft = "[[CLIENT NAME]] agrees. [[CLIENT NAME]] further agrees.";
  assert.equal(extractPlaceholders(draft).length, 1);
});

test("extraction preserves document order", () => {
  const draft = "[[THIRD]] no — [[ALPHA]] then [[BETA]]".replace("[[THIRD]] no — ", "");
  assert.deepEqual(
    extractPlaceholders(draft).map((p) => p.raw),
    ["ALPHA", "BETA"],
  );
});

// ── Filling: it may only touch the blanks ────────────────────────────────────

test("filling replaces every occurrence of a matched blank and nothing else", () => {
  const draft = "Dear [[NAME]], this concerns [[NAME]] and the sum of [[AMOUNT]].";
  const { text, filled } = applyPlaceholderAnswers(draft, { name: "Jane Roe" });

  assert.equal(filled, 2, "both occurrences count as filled");
  assert.equal(text, "Dear Jane Roe, this concerns Jane Roe and the sum of [[AMOUNT]].");
});

test("an unanswered blank is left in place, not blanked out", () => {
  const draft = "Due within [[NUMBER OF DAYS]] days.";
  const { text, filled } = applyPlaceholderAnswers(draft, {});
  assert.equal(filled, 0);
  assert.equal(text, draft, "an unfilled gap stays visible rather than vanishing");
});

test("an empty or whitespace answer does not fill a blank", () => {
  const draft = "Signed by [[SIGNER]].";
  const { text, filled } = applyPlaceholderAnswers(draft, { signer: "   " });
  assert.equal(filled, 0);
  assert.equal(text, draft);
});

test("filling never rewrites surrounding approved language", () => {
  // The attorney's words are outside the brackets. This is why the fill is a
  // regex over [[...]] rather than a model pass.
  const draft =
    "RELEASE. The undersigned releases [[RELEASEE]] from all claims, known and unknown, " +
    "arising from the incident described above.";
  const { text } = applyPlaceholderAnswers(draft, { releasee: "Acme Corp." });
  assert.ok(text.includes("from all claims, known and unknown,"));
  assert.ok(text.includes("Acme Corp."));
  assert.equal(text.includes("[["), false);
});

test("field keys match what applyPlaceholderAnswers expects", () => {
  // The UI reads placeholderFields() and posts answers back keyed by field.key.
  // If these two ever disagreed, every fill would silently no-op.
  const draft = "Paid to [[PAYEE NAME — who receives it]] on [[PAYMENT DATE]].";
  const answers = Object.fromEntries(
    placeholderFields(draft).map((f, i) => [f.key, `value-${i}`]),
  );
  const { filled } = applyPlaceholderAnswers(draft, answers);
  assert.equal(filled, 2);
});

// ── Labels ───────────────────────────────────────────────────────────────────

test("all-caps descriptors are title-cased without losing punctuation", () => {
  assert.equal(humanizeLabel("FULL LEGAL NAME — Party A"), "Full Legal Name — Party A");
  assert.equal(humanizeLabel("ADDRESS,"), "Address,");
});

// ── parseDrafterResponse: truncation ─────────────────────────────────────────
// Kept from the previous suite. A run that dies mid-sentence must still yield the
// text it managed to produce — the caller decides whether that is a draft or
// recovery material, but it must not be thrown away here.

test("truncated draft (no ---END DRAFT--- marker) is still extracted", () => {
  const raw = [
    "---DRAFT READY---",
    "DEMAND LETTER",
    "",
    "Dear [[FULL LEGAL NAME — Party B]],",
    "This firm represents [[FULL LEGAL NAME — Party A]] and hereby demands",
    "payment of $[[AMOUNT]] within [[NUMBER]] days. The facts giving rise to",
    "this demand are as follo", // truncated mid-sentence, no closing marker
  ].join("\n");

  const parsed = parseDrafterResponse(raw);
  assert.ok(parsed.draftText, "truncated draft should still produce draftText");
  assert.ok(parsed.draftText!.includes("DEMAND LETTER"));
  assert.equal(
    parsed.draftText!.includes("---DRAFT READY---"),
    false,
    "the opening marker should be stripped from the draft body",
  );
});

test("truncated draft stops at the next block marker if one started", () => {
  const raw = [
    "---DRAFT READY---",
    "Body of the draft here.",
    "---FOLLOW-UP---",
    "1. What is the deadline?",
    // note: no ---END DRAFT--- and no ---END FOLLOW-UP---
  ].join("\n");

  const parsed = parseDrafterResponse(raw);
  assert.ok(parsed.draftText!.includes("Body of the draft here."));
  assert.equal(
    parsed.draftText!.includes("What is the deadline?"),
    false,
    "follow-up content must not leak into the draft body",
  );
});

test("a response with no markers at all yields no draft", () => {
  const parsed = parseDrafterResponse("lorem ipsum, no markers here at all, just prose.");
  assert.equal(parsed.draftText, null, "markerless prose is recovery material, not a draft");
});

test("blocking and non-blocking needs are read separately", () => {
  const raw = [
    "---DRAFT READY---",
    "Body.",
    "---END DRAFT---",
    "---MISSING FACTS---",
    "BLOCKING:",
    "- The governing jurisdiction",
    "NON-BLOCKING:",
    "- Your internal matter number",
    "---END MISSING---",
  ].join("\n");

  const parsed = parseDrafterResponse(raw);
  assert.deepEqual(parsed.missingFacts.blocking, ["The governing jurisdiction"]);
  assert.deepEqual(parsed.missingFacts.nonBlocking, ["Your internal matter number"]);
});

test("readiness for review is only true when the file update says so", () => {
  const withFlag = parseDrafterResponse(
    "---FILE UPDATE---\nSTATUS: READY FOR ATTORNEY REVIEW\n---END FILE UPDATE---",
  );
  assert.equal(withFlag.readyForReview, true);
  assert.equal(parseDrafterResponse("---DRAFT READY---\nBody.\n---END DRAFT---").readyForReview, false);
});
