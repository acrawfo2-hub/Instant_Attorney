// Strength Check ("How strong is my position?") — shared, client-safe types and
// the parser for the model's marker format. NO server-only imports here (this is
// imported from "use client" components; see lib/types for the same convention).
//
// The check itself is stored on case_files.legal_strategy.strength_check (JSONB —
// no migration needed). lib/file-parser.ts preserves the key when the extractor
// rewrites the strategy block.

export interface StrengthCounter {
  /** The attack opposing counsel would raise. */
  attack: string;
  /** How the client's side can respond / what blunts it (may be empty). */
  response?: string;
}

export interface StrengthEvidenceItem {
  /** The concrete document/proof to gather, phrased as an upload request. */
  item: string;
  /** Why it matters — which weakness or counterargument it closes. */
  why?: string;
}

export interface StrengthCheck {
  generated_at: string;
  /** One-paragraph bottom line, plain language. */
  headline: string;
  strongest: string[];
  weakest: string[];
  counterarguments: StrengthCounter[];
  evidence: StrengthEvidenceItem[];
  disclaimer: string;
}

export const STRENGTH_CHECK_DISCLAIMER =
  "This is preparation guidance — a way to see your case the way the other side will — not a legal opinion or a prediction of outcome. Your attorney reviews everything before it goes out.";

// ── Parser ────────────────────────────────────────────────────────────────────

function bullets(block: string, heading: string): string[] {
  const re = new RegExp(`${heading}:\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Z ]+:|\\n---|$)`, "i");
  const m = block.match(re);
  if (!m) return [];
  return m[1]
    .split("\n")
    .map((l) => l.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);
}

/**
 * Parse the model's ---STRENGTH CHECK--- block. Tolerant: missing sections come
 * back empty; returns null only when nothing usable was produced.
 */
export function parseStrengthCheck(text: string, now: Date = new Date()): StrengthCheck | null {
  const m = text.match(/---STRENGTH CHECK---([\s\S]*?)(?:---END STRENGTH CHECK---|$)/);
  const block = m ? m[1] : text;

  const headlineMatch = block.match(/HEADLINE:\s*([\s\S]*?)(?=\n[A-Z][A-Z ]+:|\n---|$)/i);
  const headline = headlineMatch?.[1]?.trim().replace(/\s+/g, " ") ?? "";

  const strongest = bullets(block, "STRONGEST");
  const weakest = bullets(block, "WEAKEST");
  const counterarguments: StrengthCounter[] = bullets(block, "COUNTERARGUMENTS").map((l) => {
    const [attack, response] = l.split(/\s*\|\|\s*/);
    return {
      attack: attack.replace(/^ATTACK:\s*/i, "").trim(),
      response: response?.replace(/^RESPONSE:\s*/i, "").trim() || undefined,
    };
  }).filter((c) => c.attack);
  const evidence: StrengthEvidenceItem[] = bullets(block, "EVIDENCE").map((l) => {
    const [item, why] = l.split(/\s*\|\|\s*/);
    return {
      item: item.replace(/^ITEM:\s*/i, "").trim(),
      why: why?.replace(/^WHY:\s*/i, "").trim() || undefined,
    };
  }).filter((e) => e.item);

  if (!headline && !strongest.length && !weakest.length && !counterarguments.length) return null;

  return {
    generated_at: now.toISOString(),
    headline,
    strongest,
    weakest,
    counterarguments,
    evidence,
    disclaimer: STRENGTH_CHECK_DISCLAIMER,
  };
}

/** Render a stored check as text the orchestrator (or a prompt) can consume. */
export function formatStrengthCheckForModel(check: StrengthCheck): string {
  const lines: string[] = [
    `STRENGTH CHECK (generated ${check.generated_at.slice(0, 10)}):`,
    `Bottom line: ${check.headline}`,
  ];
  if (check.strongest.length) {
    lines.push("Strongest points:");
    for (const s of check.strongest) lines.push(`- ${s}`);
  }
  if (check.weakest.length) {
    lines.push("Weakest points:");
    for (const w of check.weakest) lines.push(`- ${w}`);
  }
  if (check.counterarguments.length) {
    lines.push("Likely attacks from the other side:");
    for (const c of check.counterarguments)
      lines.push(`- ${c.attack}${c.response ? ` → Response: ${c.response}` : ""}`);
  }
  if (check.evidence.length) {
    lines.push("Evidence to gather:");
    for (const e of check.evidence) lines.push(`- ${e.item}${e.why ? ` (${e.why})` : ""}`);
  }
  lines.push(check.disclaimer);
  return lines.join("\n");
}
