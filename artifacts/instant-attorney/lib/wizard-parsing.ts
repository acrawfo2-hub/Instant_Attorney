// Pure parsing + checklist logic for the document Q&A wizard.
// Extracted from the wizard page so the flow can be unit-tested in isolation
// (the page imports these back, so tests guard the real runtime behavior).

export interface ParsedDrafter {
  draftText: string | null;
  missingFacts: { blocking: string[]; nonBlocking: string[] };
  questions: string[];
  readyForReview: boolean;
}

// A single piece of information the draft still needs, rendered as its own
// labeled input in the guided checklist.
export interface NeededItem {
  id: string;
  label: string; // clear, human-readable name of what to provide
  hint: string; // short why-it-matters / example, if available
  severity: "blocking" | "helpful";
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

// Make an ALL-CAPS placeholder descriptor read like a normal label.
// "FULL LEGAL NAME — Party A" -> "Full legal name — Party A"
export function humanizeLabel(raw: string): string {
  const cleaned = raw
    .split(" ")
    .map((w) => (/^[A-Z][A-Z0-9./-]+$/.test(w) ? w.charAt(0) + w.slice(1).toLowerCase() : w))
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

// Build the guided checklist of needed items. Prefer the actual [[placeholders]]
// in the draft (those are the literal blanks to fill); fall back to the parsed
// missing-facts / questions when the draft has no bracketed placeholders.
// Blocking items always come first.
export function buildNeededItems(parsed: ParsedDrafter): NeededItem[] {
  const draft = parsed.draftText ?? "";
  const blockingText = parsed.missingFacts.blocking.join(" \n ").toLowerCase();
  const placeholders = extractPlaceholders(draft);

  let items: NeededItem[] = [];

  if (placeholders.length) {
    items = placeholders.map((p, i) => {
      // Blocking only when the placeholder is named in a blocking missing-fact —
      // match on the full text first, then fall back to the short descriptor.
      // With no blocking signal at all, treat it as helpful rather than
      // overstating what's "required".
      const isBlocking =
        blockingText.includes(p.dedupeKey) || blockingText.includes(p.matchKey);
      // Find a descriptive hint: prefer a missing-fact line mentioning this item.
      const hintLine =
        [...parsed.missingFacts.blocking, ...parsed.missingFacts.nonBlocking].find((l) => {
          const lower = l.toLowerCase();
          return lower.includes(p.dedupeKey) || lower.includes(p.matchKey);
        }) ?? "";
      const hint = hintLine.replace(/\[\[[^\]]+\]\]\s*[—-]?\s*/, "").trim();
      const slug = p.dedupeKey.replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
      return {
        id: `${slug || "ph"}-${i}`,
        label: humanizeLabel(p.raw),
        hint,
        severity: isBlocking ? "blocking" : "helpful",
      } as NeededItem;
    });
  } else {
    // No bracketed placeholders — derive from missing-facts, then questions.
    const clean = (s: string) => s.replace(/\[\[[^\]]+\]\]\s*[—-]?\s*/, "").trim();
    parsed.missingFacts.blocking.forEach((b, i) =>
      items.push({ id: `b-${i}`, label: clean(b), hint: "", severity: "blocking" })
    );
    parsed.missingFacts.nonBlocking.forEach((b, i) =>
      items.push({ id: `nb-${i}`, label: clean(b), hint: "", severity: "helpful" })
    );
    if (!items.length) {
      parsed.questions.forEach((q, i) =>
        items.push({
          id: `q-${i}`,
          label: q.replace(/^\((?:blocking|important|helpful)\)\s*/i, "").trim(),
          hint: "",
          severity: /^\(blocking\)/i.test(q) ? "blocking" : "helpful",
        })
      );
    }
  }

  // Blocking first, preserve original order within each group.
  return [
    ...items.filter((it) => it.severity === "blocking"),
    ...items.filter((it) => it.severity === "helpful"),
  ];
}

// Turn the [[placeholders]] inside a fallback template into the same kind of
// blocking missing-facts + follow-up questions the AI would normally produce,
// so the wizard always tells the user exactly what info it still needs.
export function deriveQuestionsFromTemplate(template: string): {
  blocking: string[];
  questions: string[];
} {
  const seen = new Set<string>();
  const items: string[] = [];
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(template)) !== null) {
    const raw = m[1].trim();
    // Use the descriptor before any "— ..." or "..., e.g." clarifier as the key
    const key = raw.split(/—|,|\(/)[0].trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(raw);
  }

  const blocking = items.map((i) => `Need: ${i}`);
  const questions = items.map((i) => {
    const clean = i.replace(/\s*—.*$/, "").replace(/\s*,?\s*e\.g\..*$/i, "").trim();
    return `What is the ${clean.toLowerCase()}?`;
  });

  return { blocking, questions };
}

// Guarantee the right pane is never empty when the draft still has gaps:
// if the model gave a draft with [[placeholders]] but no follow-up
// questions/missing-facts (e.g. truncated), derive them from the draft.
export function ensureChecklistNeeds(p: ParsedDrafter): ParsedDrafter {
  const hasGapMarkers = /\[\[[^\]]+\]\]/.test(p.draftText ?? "");
  const hasNeeds =
    p.missingFacts.blocking.length > 0 ||
    p.missingFacts.nonBlocking.length > 0 ||
    p.questions.length > 0;
  if (p.draftText && hasGapMarkers && !hasNeeds) {
    const derived = deriveQuestionsFromTemplate(p.draftText);
    return {
      ...p,
      missingFacts: { blocking: derived.blocking, nonBlocking: [] },
      questions: derived.questions,
    };
  }
  return p;
}

// Bundle every filled checklist field (plus any free-form note) into a single
// labeled update so the model knows exactly what each answer is for. Returns
// null when there is nothing to send.
export function buildBundledMessage(
  items: NeededItem[],
  answers: Record<string, string>,
  extraNote: string
): string | null {
  const filled = items.filter((it) => answers[it.id]?.trim());
  const note = extraNote.trim();
  if (!filled.length && !note) return null;

  const lines = filled.map((it) => `- ${it.label}: ${answers[it.id].trim()}`);
  if (note) lines.push(`- Additional details: ${note}`);
  return (
    `Here is information to fill into the draft. Please re-render the COMPLETE updated draft incorporating these answers, then show any questions that still remain:\n\n` +
    lines.join("\n")
  );
}
