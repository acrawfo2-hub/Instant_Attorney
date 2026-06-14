import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseDrafterResponse,
  buildNeededItems,
  ensureChecklistNeeds,
  buildBundledMessage,
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
