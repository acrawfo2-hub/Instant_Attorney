// The [[PLACEHOLDER]] convention.
//
// A draft is never abandoned for want of a fact. Anything the drafter does not
// know is written into the document as `[[LABEL — descriptor]]`, and the
// descriptor says whether the blank is BLOCKING. That is the whole mechanism
// behind the promise that every drafting request yields a complete, visible,
// editable artifact: the gap is IN the document, legible, in position.
//
// Four functions, and they are all that is left of this module:
//
//   parseDrafterResponse    the ---DRAFT READY--- envelope → draft + needs
//   extractPlaceholders     the raw [[...]] occurrences, deduped, in order
//   placeholderFields       those, as labeled fields with a `required` flag
//   applyPlaceholderAnswers fill them in, touching nothing else
//
// `required` is load-bearing rather than cosmetic. FORUM_PLACEHOLDER is a
// BLOCKING placeholder, so a draft with an unestablished governing forum comes
// back complete with the forum blank marked required, and the client is asked
// for it like any other missing fact — instead of the draft failing, or the
// model inventing a jurisdiction.
//
// This module was extracted from the wizard page and, for a while, carried that
// page's whole guided-checklist flow with it: build a checklist, derive
// questions from a fallback template, stage starter answers, bundle them into
// one message. The page was retired in chunk 5; the checklist went with it and
// nothing ever called those again. They are gone. What remains is the
// convention, which outlived the journey.

export interface ParsedDrafter {
  draftText: string | null;
  missingFacts: { blocking: string[]; nonBlocking: string[] };
  questions: string[];
  readyForReview: boolean;
}

export function parseDrafterResponse(text: string): ParsedDrafter {
  const draftMatch = text.match(/---DRAFT READY---([\s\S]*?)---END DRAFT---/);
  const missingMatch = text.match(/---MISSING FACTS---([\s\S]*?)---END MISSING---/);
  const questionsMatch = text.match(/---FOLLOW-UP---([\s\S]*?)---END FOLLOW-UP---/);
  const fileUpdateMatch = text.match(/---FILE UPDATE---([\s\S]*?)---END FILE UPDATE---/);

  // Resilient draft extraction: if the closing marker is missing (truncation),
  // take everything after the opening marker up to the next block marker.
  let draftText: string | null = null;
  if (draftMatch) {
    draftText = draftMatch[1].trim();
  } else {
    const openDraft = text.match(/---DRAFT READY---([\s\S]*)/);
    if (openDraft) {
      const rest = openDraft[1].split(/---(?:MISSING FACTS|FOLLOW-UP|FILE UPDATE)---/)[0].trim();
      draftText = rest.length ? rest : null;
    }
  }

  const blocking: string[] = [];
  const nonBlocking: string[] = [];
  if (missingMatch) {
    const block = missingMatch[1];
    const blockingSection = block.match(/BLOCKING:([\s\S]*?)(?=NON-BLOCKING:|$)/i);
    const nonBlockingSection = block.match(/NON-BLOCKING:([\s\S]*?)$/i);
    if (blockingSection) {
      blocking.push(...blockingSection[1].split("\n").map(l => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean));
    }
    if (nonBlockingSection) {
      nonBlocking.push(...nonBlockingSection[1].split("\n").map(l => l.replace(/^[•\-*]\s*/, "").trim()).filter(Boolean));
    }
  }

  const questions: string[] = [];
  if (questionsMatch) {
    questions.push(
      ...questionsMatch[1]
        .split("\n")
        .map(l => l.replace(/^\d+\.\s*/, "").trim())
        .filter(Boolean)
    );
  }

  const readyForReview = fileUpdateMatch
    ? fileUpdateMatch[1].toUpperCase().includes("READY FOR ATTORNEY REVIEW")
    : false;

  return { draftText, missingFacts: { blocking, nonBlocking }, questions, readyForReview };
}

// Make an ALL-CAPS placeholder descriptor read like a form label. Each all-caps
// word is title-cased individually, so words already in mixed case are left
// alone: "FULL LEGAL NAME — Party A" -> "Full Legal Name — Party A".
export function humanizeLabel(raw: string): string {
  const cleaned = raw
    .split(" ")
    .map((w) => {
      // Separate trailing punctuation (comma, period, etc.) so "ADDRESS," still
      // lowercases to "Address," instead of staying all-caps.
      const m = w.match(/^(.*?)([.,;:)\]]*)$/);
      const core = m ? m[1] : w;
      const punct = m ? m[2] : "";
      const titled = /^[A-Z][A-Z0-9./-]+$/.test(core)
        ? core.charAt(0) + core.slice(1).toLowerCase()
        : core;
      return titled + punct;
    })
    .join(" ");
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

// Pull the unique [[placeholders]] out of a draft, in document order.
// Dedupe on the FULL normalized text so distinct placeholders that share a base
// descriptor (e.g. "FULL LEGAL NAME — Party A" vs "FULL LEGAL NAME — Party B")
// stay separate. `matchKey` keeps the short pre-dash descriptor purely for
// loose matching against free-form blocking/hint text.
export function extractPlaceholders(draft: string): { raw: string; dedupeKey: string; matchKey: string }[] {
  const seen = new Set<string>();
  const out: { raw: string; dedupeKey: string; matchKey: string }[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(draft)) !== null) {
    const raw = m[1].trim();
    const dedupeKey = raw.replace(/\s+/g, " ").toLowerCase();
    if (!dedupeKey || seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    const matchKey = raw.split(/—|,|\(/)[0].trim().toLowerCase();
    out.push({ raw, dedupeKey, matchKey });
  }
  return out;
}

// A fillable blank derived from a [[placeholder]]: a stable key (matches
// applyPlaceholderAnswers), a clean human label, an optional hint, and whether it
// is required (a NON-BLOCKING descriptor marks it optional).
export interface PlaceholderField {
  key: string;
  label: string;
  hint: string;
  required: boolean;
}

export function placeholderFields(draftText: string): PlaceholderField[] {
  return extractPlaceholders(draftText).map(({ raw, dedupeKey }) => {
    const required = !raw.toUpperCase().includes("NON-BLOCKING");
    // Split "LABEL — descriptor" into a clean label and a why/what hint.
    const dashIdx = raw.search(/\s[—-]\s/);
    const labelRaw = dashIdx >= 0 ? raw.slice(0, dashIdx) : raw;
    let hint = dashIdx >= 0 ? raw.slice(dashIdx).replace(/^\s*[—-]\s*/, "") : "";
    // Drop the internal BLOCKING/NON-BLOCKING bookkeeping from the client-facing hint.
    hint = hint.replace(/\b(NON-)?BLOCKING\b[:\s]*/gi, "").replace(/\s*[—-]\s*$/, "").trim();
    return { key: dedupeKey, label: humanizeLabel(labelRaw.trim()), hint, required };
  });
}

// Deterministically fill [[placeholders]] in a draft with client-supplied values.
// `answers` is keyed by the placeholder's dedupeKey (the normalized full text from
// extractPlaceholders). Every [[…]] whose normalized inner text matches a provided,
// non-empty answer is replaced with that value — every occurrence, in one pass.
// Nothing else in the document is touched, so attorney-approved language is safe.
// Returns the new text plus how many placeholders were filled.
export function applyPlaceholderAnswers(
  draft: string,
  answers: Record<string, string>,
): { text: string; filled: number } {
  let filled = 0;
  const text = draft.replace(/\[\[([^\]]+)\]\]/g, (whole, inner: string) => {
    const key = inner.trim().replace(/\s+/g, " ").toLowerCase();
    const value = answers[key];
    if (value && value.trim()) {
      filled++;
      return value.trim();
    }
    return whole;
  });
  return { text, filled };
}

