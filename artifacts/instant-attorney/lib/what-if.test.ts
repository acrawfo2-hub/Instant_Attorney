import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseWhatIfResponse,
  extractJsonObject,
  answersToFacts,
  slugify,
  MAX_SCENARIOS,
} from "./what-if.ts";

// ── extractJsonObject ────────────────────────────────────────────────────────

test("extractJsonObject pulls JSON out of a ```json fenced response", () => {
  const raw = '```json\n{"intro":"hi","scenarios":[]}\n```';
  const obj = extractJsonObject(raw) as { intro: string };
  assert.equal(obj.intro, "hi");
});

test("extractJsonObject pulls JSON out of prose-wrapped output", () => {
  const raw = 'Sure! Here you go:\n{"intro":"x","scenarios":[]}\nHope that helps.';
  const obj = extractJsonObject(raw) as { intro: string };
  assert.equal(obj.intro, "x");
});

test("extractJsonObject returns null on unparseable input", () => {
  assert.equal(extractJsonObject("no json here"), null);
  assert.equal(extractJsonObject(""), null);
});

// ── parseWhatIfResponse ──────────────────────────────────────────────────────

test("parses a well-formed response and normalizes scenarios", () => {
  const raw = JSON.stringify({
    intro: "Let's think through a few things.",
    scenarios: [
      {
        id: "beneficiary-predeceases",
        question: "What if a beneficiary dies before you?",
        why_it_matters: "Your gift could lapse.",
        legal_basis: "Anti-lapse statute",
        fact_label: "Backup beneficiary",
        doc_nudge: "You may want a backup beneficiary clause.",
      },
    ],
    closing: "Save these to your file.",
  });
  const result = parseWhatIfResponse(raw);
  assert.equal(result.intro, "Let's think through a few things.");
  assert.equal(result.closing, "Save these to your file.");
  assert.equal(result.scenarios.length, 1);
  assert.equal(result.scenarios[0].id, "beneficiary-predeceases");
  assert.equal(result.scenarios[0].doc_nudge, "You may want a backup beneficiary clause.");
});

test("drops scenarios missing a question or why_it_matters", () => {
  const raw = JSON.stringify({
    intro: "",
    scenarios: [
      { question: "", why_it_matters: "x", legal_basis: "y", fact_label: "z" },
      { question: "valid?", why_it_matters: "", legal_basis: "y", fact_label: "z" },
      { question: "What if X?", why_it_matters: "because", legal_basis: "law", fact_label: "X" },
    ],
  });
  const result = parseWhatIfResponse(raw);
  assert.equal(result.scenarios.length, 1);
  assert.equal(result.scenarios[0].question, "What if X?");
});

test("derives an id and fact_label when the model omits them", () => {
  const raw = JSON.stringify({
    scenarios: [{ question: "What if the buyer defaults?", why_it_matters: "risk" }],
  });
  const result = parseWhatIfResponse(raw);
  assert.equal(result.scenarios[0].id, "what-if-the-buyer-defaults");
  assert.ok(result.scenarios[0].fact_label.length > 0);
});

test("de-duplicates colliding scenario ids", () => {
  const raw = JSON.stringify({
    scenarios: [
      { id: "dup", question: "Q1?", why_it_matters: "a" },
      { id: "dup", question: "Q2?", why_it_matters: "b" },
    ],
  });
  const result = parseWhatIfResponse(raw);
  assert.notEqual(result.scenarios[0].id, result.scenarios[1].id);
});

test("caps scenarios at MAX_SCENARIOS", () => {
  const scenarios = Array.from({ length: MAX_SCENARIOS + 5 }, (_, i) => ({
    question: `What if ${i}?`,
    why_it_matters: "x",
  }));
  const result = parseWhatIfResponse(JSON.stringify({ scenarios }));
  assert.equal(result.scenarios.length, MAX_SCENARIOS);
});

test("returns an empty well-formed result on garbage input", () => {
  const result = parseWhatIfResponse("the model failed");
  assert.deepEqual(result, { intro: "", scenarios: [] });
});

// ── answersToFacts ───────────────────────────────────────────────────────────

test("maps answers to prefixed {label,value} pairs and drops blanks", () => {
  const pairs = answersToFacts([
    { fact_label: "Backup guardian", value: "My sister Jane" },
    { fact_label: "Ignored", value: "   " },
    { fact_label: "", value: "no label" },
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].label, "What-if · Backup guardian");
  assert.equal(pairs[0].value, "My sister Jane");
});

test("answersToFacts tolerates non-array input", () => {
  // @ts-expect-error testing runtime guard
  assert.deepEqual(answersToFacts(null), []);
});

// ── slugify ──────────────────────────────────────────────────────────────────

test("slugify produces a clean kebab slug with a fallback", () => {
  assert.equal(slugify("What if X?!"), "what-if-x");
  assert.equal(slugify("!!!", "fallback"), "fallback");
});
