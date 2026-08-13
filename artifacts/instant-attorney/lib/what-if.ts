// ─────────────────────────────────────────────────────────────────────────────
// What-If Game — standalone strategy tool.
//
// A separate, OPTIONAL tool that helps a user pressure-test their goals against
// scenarios the law has dealt with many times before. It is intentionally
// decoupled from document drafting:
//   • it NEVER writes legal_strategy.recommended_wizards / instruments, so it
//     cannot change which instruments the Living File surfaces;
//   • its scenario output lives in its own store (what_if_sessions);
//   • the only thing it writes into the shared Living File is new fact_items
//     (per the product decision "auto-write facts, not strategy").
//
// This module is PURE — parsing, validation, and fact mapping only. It must use
// RELATIVE imports (no "@/lib") so the node:test runner can load it.
// ─────────────────────────────────────────────────────────────────────────────

/** Hard cap so a runaway generation can never flood the UI or the file. */
export const MAX_SCENARIOS = 8;

/** One "what if…" scenario the user is invited to think through. */
export interface WhatIfScenario {
  /** Stable slug used as a React key and to dedupe answers. */
  id: string;
  /** The "What if…" question posed to the user. */
  question: string;
  /** Why thinking about this sharpens their strategy (plain language). */
  why_it_matters: string;
  /** The recognized legal pattern this question is grounded in. */
  legal_basis: string;
  /** Clean label used when the user's answer is saved as a fact_item. */
  fact_label: string;
  /**
   * Optional soft, read-only nudge ("you may want a document that…"). This is
   * deliberately a plain sentence, NOT an instrument token — the What-If Game
   * must never drive drafting.
   */
  doc_nudge?: string;
}

export interface WhatIfResult {
  /** Brief framing shown before the scenarios. */
  intro: string;
  scenarios: WhatIfScenario[];
  /** Optional closing line shown on the summary screen. */
  closing?: string;
}

/** One answered scenario coming back from the client. */
export interface WhatIfAnswer {
  /** Scenario id (or fact label) the answer belongs to. */
  fact_label: string;
  /** What the user typed. */
  value: string;
}

/** A {label, value} pair ready for the fact_items dedupe-by-prefix writer. */
export interface FactPair {
  label: string;
  value: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Make a stable, file-safe slug from a string (for scenario ids / fact labels). */
export function slugify(input: string, fallback = "scenario"): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || fallback;
}

/**
 * Extract a JSON object from a model response that may be wrapped in prose or a
 * ```json fence. Returns null when nothing parseable is found.
 */
export function extractJsonObject(raw: string): unknown {
  if (!raw) return null;
  // Strip code fences first so the brace scan sees clean JSON.
  const unfenced = raw.replace(/```(?:json)?/gi, "").trim();
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const candidate = unfenced.slice(start, end + 1);
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/**
 * Parse + validate the model's What-If response into a normalized result.
 * Never throws — malformed scenarios are dropped, and a wholly unparseable
 * response yields an empty (but well-formed) result the caller can treat as a
 * soft failure.
 */
export function parseWhatIfResponse(raw: string): WhatIfResult {
  const obj = extractJsonObject(raw) as Record<string, unknown> | null;
  if (!obj) return { intro: "", scenarios: [] };

  const rawScenarios = Array.isArray(obj.scenarios) ? obj.scenarios : [];
  const seen = new Set<string>();
  const scenarios: WhatIfScenario[] = [];

  for (const entry of rawScenarios) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;

    const question = asString(e.question);
    const why = asString(e.why_it_matters);
    const basis = asString(e.legal_basis);
    if (!question || !why) continue; // a scenario with no question/why is useless

    const factLabel = asString(e.fact_label) || question.slice(0, 60);
    let id = asString(e.id) || slugify(question);
    // Guarantee uniqueness so React keys / answer dedupe never collide.
    while (seen.has(id)) id = `${id}-x`;
    seen.add(id);

    const nudge = asString(e.doc_nudge);

    scenarios.push({
      id,
      question,
      why_it_matters: why,
      legal_basis: basis,
      fact_label: factLabel,
      ...(nudge ? { doc_nudge: nudge } : {}),
    });

    if (scenarios.length >= MAX_SCENARIOS) break;
  }

  return {
    intro: asString(obj.intro),
    scenarios,
    ...(asString(obj.closing) ? { closing: asString(obj.closing) } : {}),
  };
}

/**
 * Map answered scenarios to clean {label, value} fact pairs.
 *
 * Empty answers are dropped. Labels are prefixed with "What-if" so these facts
 * are recognizable in the Living File and never collide with drafter-written
 * facts that share a bare label. Dedupe-by-prefix on the write side then keeps
 * one fact per scenario even across repeated plays.
 */
export function answersToFacts(answers: WhatIfAnswer[]): FactPair[] {
  if (!Array.isArray(answers)) return [];
  const out: FactPair[] = [];
  for (const a of answers) {
    if (!a || typeof a !== "object") continue;
    const value = asString(a.value);
    const label = asString(a.fact_label);
    if (!value || !label) continue;
    out.push({ label: `What-if · ${label}`, value });
  }
  return out;
}
