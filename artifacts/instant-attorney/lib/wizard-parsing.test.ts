import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDrafterResponse,
  buildNeededItems,
  buildFallbackTemplate,
  deriveQuestionsFromTemplate,
  ensureChecklistNeeds,
  buildBundledMessage,
  buildStarterItems,
  mapAnswersToPlaceholders,
  type ParsedDrafter,
} from "./wizard-parsing.ts";

// ── Regression 1: empty right pane ───────────────────────────────────────────
// A draft full of [[placeholders]] but with NO ---MISSING FACTS--- / ---FOLLOW-UP---
// blocks must still yield a non-empty checklist so the right pane is never blank.

test("draft with [[placeholders]] but no follow-up/missing blocks still builds a checklist", () => {
  const raw = [
    "---DRAFT READY---",
    "This Agreement is between [[FULL LEGAL NAME — Party A]] and",
    "[[FULL LEGAL NAME — Party B]] for the sum of $[[AMOUNT]].",
    "---END DRAFT---",
  ].join("\n");

  let parsed = parseDrafterResponse(raw);
  // No missing-facts / follow-up blocks were present in the model output.
  assert.equal(parsed.missingFacts.blocking.length, 0);
  assert.equal(parsed.missingFacts.nonBlocking.length, 0);
  assert.equal(parsed.questions.length, 0);
  assert.ok(parsed.draftText, "draft text should be extracted");

  // The page derives needs from the bracketed gaps so the pane is not empty.
  parsed = ensureChecklistNeeds(parsed);
  const items = buildNeededItems(parsed);
  assert.ok(items.length >= 3, `expected a checklist for each unique placeholder, got ${items.length}`);

  const labels = items.map((i) => i.label.toLowerCase());
  assert.ok(labels.some((l) => l.includes("party a")));
  assert.ok(labels.some((l) => l.includes("party b")));
  assert.ok(labels.some((l) => l.includes("amount")));
});

test("buildNeededItems alone produces items from placeholders with an empty parsed shape", () => {
  const parsed: ParsedDrafter = {
    draftText: "Notice to [[TENANT NAME]] regarding [[PROPERTY ADDRESS]].",
    missingFacts: { blocking: [], nonBlocking: [] },
    questions: [],
    readyForReview: false,
  };
  const items = buildNeededItems(parsed);
  assert.equal(items.length, 2);
  // Without any blocking signal, placeholders are surfaced as "helpful", not required.
  assert.ok(items.every((i) => i.severity === "helpful"));
});

// ── Regression 2: truncated draft ────────────────────────────────────────────
// When the model hits its token limit mid-draft, the closing ---END DRAFT---
// marker is missing. The draft must still be extracted (so it can be saved and
// the Send-to-Attorney CTA — gated on a non-null draft — stays visible).

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
  assert.ok(
    parsed.draftText!.includes("DEMAND LETTER"),
    "extracted draft should contain the opening content"
  );
  assert.ok(
    !parsed.draftText!.includes("---DRAFT READY---"),
    "the opening marker should be stripped from the draft body"
  );
  // CTA visibility in the page is gated on a non-null current draft.
  const ctaVisible = parsed.draftText !== null;
  assert.equal(ctaVisible, true);
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
  assert.ok(parsed.draftText);
  assert.ok(parsed.draftText!.includes("Body of the draft here."));
  assert.ok(
    !parsed.draftText!.includes("What is the deadline?"),
    "follow-up content must not leak into the draft body"
  );
});

// ── Regression 3: bundled update message ─────────────────────────────────────
// Filling checklist fields and clicking Update must send a SINGLE bundled
// message containing every filled answer (plus the optional free-form note).

test("filling checklist fields bundles all answers into one message", () => {
  const parsed: ParsedDrafter = {
    draftText: "Agreement between [[FULL LEGAL NAME — Party A]] and [[FULL LEGAL NAME — Party B]] for $[[AMOUNT]].",
    missingFacts: { blocking: [], nonBlocking: [] },
    questions: [],
    readyForReview: false,
  };
  const items = buildNeededItems(parsed);
  assert.equal(items.length, 3);

  const answers: Record<string, string> = {
    [items[0].id]: "Jane Doe",
    [items[1].id]: "Acme Corp",
    [items[2].id]: "5,000",
  };

  const msg = buildBundledMessage(items, answers, "Please keep the tone firm.");
  assert.ok(msg, "a bundled message should be produced when fields are filled");

  // One message — every answer present in a single string.
  assert.ok(msg!.includes("Jane Doe"));
  assert.ok(msg!.includes("Acme Corp"));
  assert.ok(msg!.includes("5,000"));
  assert.ok(msg!.includes("Additional details: Please keep the tone firm."));

  // It is one bundled instruction (single re-render request), not one-per-field.
  const renderRequests = msg!.match(/re-render the COMPLETE updated draft/g) ?? [];
  assert.equal(renderRequests.length, 1);

  // One bullet line per filled answer, plus the note line.
  const bulletLines = msg!.split("\n").filter((l) => l.startsWith("- "));
  assert.equal(bulletLines.length, 4);
});

test("buildBundledMessage returns null when nothing is filled in", () => {
  const parsed: ParsedDrafter = {
    draftText: "Agreement with [[AMOUNT]].",
    missingFacts: { blocking: [], nonBlocking: [] },
    questions: [],
    readyForReview: false,
  };
  const items = buildNeededItems(parsed);
  assert.equal(buildBundledMessage(items, {}, ""), null);
  // Whitespace-only answers and note also count as empty.
  assert.equal(buildBundledMessage(items, { [items[0].id]: "   " }, "   "), null);
});

test("a free-form note alone still produces a message", () => {
  const items = buildNeededItems({
    draftText: "No placeholders here.",
    missingFacts: { blocking: [], nonBlocking: [] },
    questions: [],
    readyForReview: false,
  });
  const msg = buildBundledMessage(items, {}, "Add an arbitration clause.");
  assert.ok(msg);
  assert.ok(msg!.includes("Additional details: Add an arbitration clause."));
});

// ── Regression 4: auto-recovery from a broken/empty AI draft ─────────────────
// The wizard must never strand the user on a blank screen. When the AI call
// fails or returns garbage with no recognizable markers, the page builds a
// fallback template AND derives the checklist of info the user still needs.
// These tests mirror that absolute-fallback path in runDrafter().

// Replicates the runDrafter() recovery branch so the test guards the real flow.
function recoverFromAiResponse(fullText: string, label: string, wizardType: string): ParsedDrafter {
  let p = parseDrafterResponse(fullText);
  // If the model returned prose with no markers, use the whole thing as the draft.
  if (!p.draftText && fullText.trim()) {
    p = { ...p, draftText: fullText.trim() };
  }
  // Absolute fallback — empty/garbled AI text yields a template + derived needs.
  if (!p.draftText) {
    const template = buildFallbackTemplate(label, wizardType);
    const derived = deriveQuestionsFromTemplate(template);
    p = {
      ...p,
      draftText: template,
      missingFacts: {
        blocking: p.missingFacts.blocking.length ? p.missingFacts.blocking : derived.blocking,
        nonBlocking: p.missingFacts.nonBlocking,
      },
      questions: p.questions.length ? p.questions : derived.questions,
    };
  }
  return ensureChecklistNeeds(p);
}

test("empty AI response falls back to a template and a derived checklist of needs", () => {
  // The AI returned nothing usable (failed call / empty body).
  const p = recoverFromAiResponse("", "Settlement Agreement", "draft_contract");

  // A usable draft is guaranteed, not a blank screen.
  assert.ok(p.draftText, "a fallback draft must be produced");
  assert.ok(/AGREEMENT/.test(p.draftText!), "the contract template should be used");
  assert.ok(/\[\[[^\]]+\]\]/.test(p.draftText!), "the template carries fillable placeholders");

  // A checklist of needed items is derived directly from the template gaps.
  assert.ok(p.questions.length > 0, "questions must be derived so the user knows what's needed");
  assert.ok(p.missingFacts.blocking.length > 0, "blocking missing-facts must be derived");

  const items = buildNeededItems(p);
  assert.ok(items.length > 0, "the right pane checklist must not be empty");
});

test("garbled AI text with no markers becomes the draft (whole response used)", () => {
  const garbled = "lorem ipsum dolor sit amet, no markers here at all, just prose.";
  const p = recoverFromAiResponse(garbled, "Demand Letter", "demand_letter");

  // No ---DRAFT READY--- markers, so the entire response is treated as the draft.
  assert.equal(p.draftText, garbled);
  // It has no bracketed gaps, so no derived needs are invented.
  assert.equal(p.missingFacts.blocking.length, 0);
  assert.equal(p.questions.length, 0);
});

test("prose with no markers is preserved verbatim as the draft", () => {
  const prose = [
    "Dear Mr. Smith,",
    "",
    "This letter concerns the outstanding balance on your account.",
    "Please remit payment at your earliest convenience.",
  ].join("\n");
  const p = recoverFromAiResponse(prose, "Demand Letter", "demand_letter");
  assert.equal(p.draftText, prose, "the whole prose response becomes the draft");
});

for (const wizardType of ["demand_letter", "draft_contract", "draft_waiver", "generic"]) {
  test(`buildFallbackTemplate(${wizardType}) produces fillable [[placeholders]]`, () => {
    const template = buildFallbackTemplate("Test Document", wizardType);
    assert.ok(template.trim().length > 0, "template must not be empty");

    const placeholders = template.match(/\[\[[^\]]+\]\]/g) ?? [];
    assert.ok(placeholders.length > 0, `${wizardType} template must have [[placeholders]]`);

    // Every placeholder must be a real fillable gap (non-empty between brackets).
    assert.ok(
      placeholders.every((ph) => ph.replace(/^\[\[|\]\]$/g, "").trim().length > 0),
      "placeholders must not be empty brackets"
    );

    // Each type yields a derivable checklist from its own placeholders.
    const derived = deriveQuestionsFromTemplate(template);
    assert.ok(derived.questions.length > 0, `${wizardType} must derive at least one question`);
    assert.ok(derived.blocking.length > 0, `${wizardType} must derive at least one blocking need`);
  });
}

// ── Starter questions (parallel "punch 1") ───────────────────────────────────
// While the real draft composes, the wizard shows document-type-aware starter
// questions instantly (no AI). They must be relevant per type and have stable ids.

test("buildStarterItems returns document-type-aware questions with stable ids", () => {
  const demand = buildStarterItems("demand_letter");
  assert.ok(demand.length >= 3 && demand.length <= 6);
  // All ids unique and stable (slugged from the label).
  const ids = demand.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id.startsWith("starter-")));
  // Demand-letter specific: asks about a response deadline.
  assert.ok(demand.some((i) => /deadline/i.test(i.label)));

  const contract = buildStarterItems("draft_contract");
  assert.ok(contract.some((i) => /party/i.test(i.label)));
  // Different types ask different things.
  assert.notDeepEqual(demand.map((i) => i.label), contract.map((i) => i.label));
});

test("buildStarterItems falls back to the general set for an unknown type", () => {
  const items = buildStarterItems("totally_made_up_type");
  assert.ok(items.length > 0, "must never be empty so the pane always has questions");
  assert.deepEqual(items.map((i) => i.label), buildStarterItems("general_document").map((i) => i.label));
});

// ── Deterministic fold mapping (B2) ──────────────────────────────────────────
// An answer is filled deterministically ONLY when it maps to exactly one specific
// placeholder. Ambiguous / generic / unmatched answers are left for the AI pass.

test("mapAnswersToPlaceholders fills a unique, specific placeholder deterministically", () => {
  const draft = "Governed by the laws of [[GOVERNING STATE]]. Respond within [[RESPONSE DEADLINE — days]].";
  const { byKey, leftover } = mapAnswersToPlaceholders(draft, [
    { label: "Governing state", value: "Texas" },
    { label: "Response deadline", value: "14 days" },
  ]);
  assert.equal(byKey["governing state"], "Texas");
  assert.equal(byKey["response deadline — days"], "14 days");
  assert.equal(leftover.length, 0);
});

test("mapAnswersToPlaceholders leaves an ambiguous match for the AI pass", () => {
  // Two address placeholders — a generic "address" answer must NOT be guessed into one.
  const draft = "Sender: [[ADDRESS — Party A]]. Recipient: [[ADDRESS — Party B]].";
  const { byKey, leftover } = mapAnswersToPlaceholders(draft, [
    { label: "Your mailing address", value: "1 Main St" },
  ]);
  assert.deepEqual(byKey, {}, "ambiguous answers are never placed deterministically");
  assert.equal(leftover.length, 1);
  assert.equal(leftover[0].value, "1 Main St");
});

test("mapAnswersToPlaceholders defers a generic single-word placeholder", () => {
  // A lone generic "[[AMOUNT]]" is not specific enough to match loosely.
  const draft = "Pay $[[AMOUNT]] to the claimant.";
  const { byKey, leftover } = mapAnswersToPlaceholders(draft, [
    { label: "Amount or specific action demanded", value: "$5,000" },
  ]);
  assert.deepEqual(byKey, {});
  assert.equal(leftover.length, 1);
});

test("mapAnswersToPlaceholders puts unmatched answers in leftover", () => {
  const draft = "Agreement governed by [[GOVERNING STATE]].";
  const { byKey, leftover } = mapAnswersToPlaceholders(draft, [
    { label: "Main purpose of the document", value: "Sell a car" },
  ]);
  assert.deepEqual(byKey, {});
  assert.deepEqual(leftover, [{ label: "Main purpose of the document", value: "Sell a car" }]);
});

test("each wizard type yields a distinct, type-appropriate template", () => {
  const demand = buildFallbackTemplate("X", "demand_letter");
  const contract = buildFallbackTemplate("X", "draft_contract");
  const waiver = buildFallbackTemplate("X", "draft_waiver");
  const generic = buildFallbackTemplate("X", "general_document");

  assert.ok(/DEMAND/.test(demand));
  assert.ok(/AGREEMENT/.test(contract));
  assert.ok(/RELEASE AND WAIVER/.test(waiver));
  // The generic branch handles any unknown type without throwing.
  assert.ok(generic.includes("PRELIMINARY NOTE"));

  const all = [demand, contract, waiver, generic];
  assert.equal(new Set(all).size, all.length, "templates should differ by type");
});
