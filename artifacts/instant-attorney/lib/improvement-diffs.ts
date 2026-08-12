import { createHash } from "node:crypto";

export interface DocumentAnchor {
  section_id: string;
  start: number;
  end: number;
  quote: string;
  source_hash: string;
}

export interface ImprovementDiff {
  anchor: DocumentAnchor;
  before: string;
  after: string;
  created_at: string;
}

export function textHash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
}

/** Locate a stable paragraph/section range in a particular source revision. */
export function locateImprovementRange(
  text: string,
  improvement: { section?: string | null; title?: string; proposed_change?: string },
): DocumentAnchor {
  const paragraphs = [...text.matchAll(/[^\n]+(?:\n(?!\n)[^\n]+)*/g)];
  const needle = tokens(`${improvement.section ?? ""} ${improvement.title ?? ""} ${improvement.proposed_change ?? ""}`);
  let best = paragraphs[0];
  let bestScore = -1;
  for (const paragraph of paragraphs) {
    const haystack = tokens(paragraph[0]);
    let score = 0;
    for (const token of needle) if (haystack.has(token)) score += 1;
    if (improvement.section && paragraph[0].toLowerCase().includes(improvement.section.toLowerCase())) score += 20;
    if (score > bestScore) { best = paragraph; bestScore = score; }
  }
  const quote = best?.[0] ?? text;
  const start = best?.index ?? 0;
  const sectionKey = `${improvement.section ?? "General"}:${quote.slice(0, 160)}`;
  return {
    section_id: `section-${textHash(sectionKey).slice(0, 16)}`,
    start,
    end: start + quote.length,
    quote,
    source_hash: textHash(text),
  };
}

export function createImprovementDiff(text: string, anchor: DocumentAnchor, replacement: string): ImprovementDiff {
  if (textHash(text) !== anchor.source_hash || text.slice(anchor.start, anchor.end) !== anchor.quote) {
    throw new Error("The working revision changed. Refresh this finding before applying it.");
  }
  return { anchor, before: anchor.quote, after: replacement.trim(), created_at: new Date().toISOString() };
}

export function applyImprovementDiff(text: string, diff: ImprovementDiff): string {
  if (textHash(text) !== diff.anchor.source_hash || text.slice(diff.anchor.start, diff.anchor.end) !== diff.before) {
    throw new Error("The working revision changed after this diff was proposed. Create a new diff.");
  }
  return text.slice(0, diff.anchor.start) + diff.after + text.slice(diff.anchor.end);
}

export function affectsAuthorities(diff: ImprovementDiff): boolean {
  return /\b(v\.|code|statute|rule|§|u\.s\.c\.|citation|court)\b/i.test(`${diff.before}\n${diff.after}`);
}
