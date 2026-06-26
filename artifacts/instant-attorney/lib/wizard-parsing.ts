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

// Normalize a label/fact into a comparable key: lowercase alphanumeric words.
function normalizeFactKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/\[\[[^\]]+\]\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// True when the file already holds a confirmed fact that answers this checklist
// item, so we should not ask for it again. Cross-document reuse: a fact captured
// while drafting document 1 (stored by save-answers as "<label>: <value>")
// suppresses the matching question when drafting document 3. Identity-bearing
// labels stay distinct — "Full legal name — Party A" never matches "— Party B"
// — because we compare the FULL normalized label, not just its head.
export function isAnsweredByFacts(item: NeededItem, confirmedFacts: string[]): boolean {
  const itemKey = normalizeFactKey(item.label);
  if (itemKey.length < 4) return false; // too generic to match safely
  for (const fact of confirmedFacts) {
    const factLabel = normalizeFactKey(fact.split(":")[0] ?? fact);
    if (!factLabel) continue;
    if (factLabel === itemKey) return true;
    // Strong containment either direction, guarded by length to avoid loose hits.
    if (itemKey.length >= 6 && factLabel.includes(itemKey)) return true;
    if (factLabel.length >= 6 && itemKey.includes(factLabel)) return true;
  }
  return false;
}

// Build the guided checklist of needed items. Prefer the actual [[placeholders]]
// in the draft (those are the literal blanks to fill); fall back to the parsed
// missing-facts / questions when the draft has no bracketed placeholders.
// Blocking items always come first.
//
// `confirmedFacts` are the file's confirmed fact descriptions ("<label>: <value>").
// Any item already answered by one of them is dropped so the wizard never asks
// for information the Living File already holds — including info captured while
// drafting an earlier document in the same file.
export function buildNeededItems(
  parsed: ParsedDrafter,
  confirmedFacts: string[] = [],
): NeededItem[] {
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

  // Drop anything the Living File already answers (never ask twice).
  const remaining = confirmedFacts.length
    ? items.filter((it) => !isAnsweredByFacts(it, confirmedFacts))
    : items;

  // Blocking first, preserve original order within each group.
  return [
    ...remaining.filter((it) => it.severity === "blocking"),
    ...remaining.filter((it) => it.severity === "helpful"),
  ];
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

// Guarantee a usable first draft even when the AI call fails or returns nothing.
// Produces a built-in template seeded with [[placeholders]] for the info the
// user must still provide. The attorney's review pass will improve it regardless
// of starting quality.
export function buildFallbackTemplate(label: string, wizardType: string): string {
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const party = "[[FULL LEGAL NAME — Party A]]";
  const oParty = "[[FULL LEGAL NAME — Party B / Opposing Party]]";
  const jurisdiction = "[[JURISDICTION — State]]";
  const addr = "[[ADDRESS]]";

  if (wizardType === "demand_letter") {
    return `${today}

VIA CERTIFIED MAIL — RETURN RECEIPT REQUESTED

${oParty}
${addr}

Re:    DEMAND FOR ${label.toUpperCase()}

Dear ${oParty}:

This firm represents ${party} in connection with the above-captioned matter. We write to formally demand the following:

1.  BACKGROUND
    [[Describe the facts giving rise to this demand — dates, events, amounts owed, breach, etc.]]

2.  DEMAND
    ${party} hereby demands that you [[specific action required — e.g., pay $X, cease and desist, return property]] within [[NUMBER]] days of the date of this letter.

3.  LEGAL BASIS
    Your conduct constitutes [[legal theory — e.g., breach of contract, tortious interference, conversion]] under ${jurisdiction} law.

4.  CONSEQUENCE OF NON-COMPLIANCE
    If you fail to comply with this demand by [[DEADLINE DATE]], ${party} will pursue all available legal remedies, including but not limited to filing suit in [[COURT]], seeking actual damages, consequential damages, attorneys' fees, and court costs.

This letter is written without prejudice to any other rights or remedies available to ${party}.

Sincerely,

Crawford Law PLLC
${addr}
Texas Bar No. 24148908`;
  }

  if (wizardType === "draft_contract") {
    return `AGREEMENT

This Agreement ("Agreement") is entered into as of ${today}, by and between:

${party} ("Party A"), and
${oParty} ("Party B").

RECITALS

WHEREAS, the parties desire to [[describe the purpose of the agreement]];

NOW, THEREFORE, in consideration of the mutual covenants set forth herein, the parties agree as follows:

1.  SERVICES / OBLIGATIONS
    [[Describe what each party is obligated to do under this agreement.]]

2.  COMPENSATION
    Party B shall pay Party A the sum of $[[AMOUNT]] [[payment schedule — e.g., monthly, upon completion]].

3.  TERM
    This Agreement commences on [[START DATE]] and terminates on [[END DATE]], unless earlier terminated as provided herein.

4.  TERMINATION
    Either party may terminate this Agreement upon [[NUMBER]] days' written notice. [[Describe any termination for cause provisions.]]

5.  GOVERNING LAW
    This Agreement shall be governed by the laws of the State of ${jurisdiction}.

6.  ENTIRE AGREEMENT
    This Agreement constitutes the entire agreement between the parties and supersedes all prior negotiations, representations, or agreements.

IN WITNESS WHEREOF, the parties have executed this Agreement as of the date first written above.

Party A: _______________________________    Date: ____________
${party}

Party B: _______________________________    Date: ____________
${oParty}`;
  }

  if (wizardType === "draft_waiver") {
    return `RELEASE AND WAIVER OF CLAIMS

This Release and Waiver of Claims ("Release") is entered into as of ${today}, by and between:

${party} ("Releasing Party"), and
${oParty} ("Released Party").

1.  RECITALS
    This Release arises from [[describe the underlying matter or dispute]].

2.  RELEASE
    In consideration of [[describe consideration — e.g., payment of $X, settlement of dispute]], the receipt and sufficiency of which are hereby acknowledged, Releasing Party hereby releases and forever discharges Released Party from any and all claims, demands, damages, actions, or causes of action arising from or related to [[the subject matter]].

3.  SCOPE
    This Release covers all claims known and unknown as of the date of execution, including claims under ${jurisdiction} law.

4.  NO ADMISSION
    This Release does not constitute an admission of liability by any party.

5.  GOVERNING LAW
    This Release shall be construed under the laws of the State of ${jurisdiction}.

Releasing Party: _______________________________    Date: ____________
${party}

Released Party: _______________________________    Date: ____________
${oParty}`;
  }

  // Generic fallback for all other types
  return `${label.toUpperCase()}

Date: ${today}
Prepared for: ${party}
Jurisdiction: ${jurisdiction}

---

PRELIMINARY NOTE: This is a working template. Your attorney will refine this draft based on your specific facts. Items marked [[IN BRACKETS]] require information from you.

---

1.  PARTIES

    ${party}
    ${addr}
    ("Client / Principal")

    ${oParty}
    ${addr}
    ("Counterparty")

2.  BACKGROUND AND PURPOSE

    [[Describe the facts and circumstances giving rise to this document. Include relevant dates, prior agreements, events, and the specific legal issue being addressed.]]

3.  MATERIAL TERMS

    [[Set forth the key operative terms — what is being agreed to, transferred, demanded, or resolved.]]

    a.  [[First material term]]
    b.  [[Second material term]]
    c.  [[Additional terms as needed]]

4.  CONSIDERATION

    In consideration of [[describe consideration — money, services, mutual promises]], the receipt and sufficiency of which are acknowledged, the parties agree to the terms set forth herein.

5.  REPRESENTATIONS AND WARRANTIES

    Each party represents and warrants that:
    (a) they have full authority to enter into this arrangement;
    (b) [[additional representations specific to this matter]].

6.  GOVERNING LAW AND DISPUTE RESOLUTION

    This document shall be governed by the laws of the State of ${jurisdiction}. Any dispute arising hereunder shall be resolved by [[mediation / arbitration / litigation]] in [[COUNTY]], ${jurisdiction}.

7.  SIGNATURES

    Executed as of the date first written above.

    ___________________________    Date: ____________
    ${party}

    ___________________________    Date: ____________
    ${oParty}

---
ATTORNEY REVIEW NOTE: This draft was generated from the client's Living File. Attorney should verify: [[list specific items to confirm with client before finalizing]].`;
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

// ── Parallel "starter questions" ─────────────────────────────────────────────
// While the real draft is being composed, the wizard shows a few document-type
// aware questions the client can answer during the wait. These are curated per
// wizard type (names, addresses, timelines, governing law, etc.) so they ask for
// the exact "legal-ready" facts the attorney needs — and they require NO AI call,
// so they appear instantly. Their answers are saved as facts immediately and
// folded into the draft once it lands.
export const WIZARD_STARTER_FIELDS: Record<string, { label: string; hint: string }[]> = {
  demand_letter: [
    { label: "Your full legal name", hint: "The sender — exactly as it should appear." },
    { label: "Your mailing address", hint: "Where the recipient should respond." },
    { label: "Recipient's full name", hint: "The person or business you're sending this to." },
    { label: "Recipient's mailing address", hint: "Where the letter will be sent." },
    { label: "Amount or specific action demanded", hint: "e.g. $5,000 owed, return of property, stop a behavior." },
    { label: "Response deadline", hint: "How many days they have to respond (often 10–30)." },
  ],
  complaint_letter: [
    { label: "Your full name and contact info", hint: "The complainant." },
    { label: "Agency or company receiving the complaint", hint: "Who you're filing with." },
    { label: "Name of the person or business complained about", hint: "The respondent." },
    { label: "Dates the events happened", hint: "A short timeline helps." },
    { label: "What outcome you want", hint: "The relief or resolution you're asking for." },
  ],
  draft_contract: [
    { label: "Full legal name of each party", hint: "Everyone signing — people or business entities." },
    { label: "Each party's address", hint: "Used in the parties / notice section." },
    { label: "Effective date and term", hint: "When it starts and how long it lasts." },
    { label: "Payment or consideration", hint: "Amount, schedule, or what each side gives." },
    { label: "Governing state", hint: "Which state's law applies." },
  ],
  draft_waiver: [
    { label: "Full name of the person giving up rights", hint: "The releasor." },
    { label: "Full name of the person or business protected", hint: "The releasee." },
    { label: "Activity or event covered", hint: "What the waiver applies to." },
    { label: "What the releasor receives", hint: "The consideration — payment, access, etc." },
    { label: "Governing state", hint: "Which state's law applies." },
  ],
  wills_trusts: [
    { label: "Your full legal name and date of birth", hint: "The testator / grantor." },
    { label: "State of residence", hint: "Determines execution formalities." },
    { label: "Executor or trustee and an alternate", hint: "Who administers the estate, plus a backup." },
    { label: "Beneficiaries and their shares", hint: "Who receives what." },
    { label: "Any specific gifts", hint: "Particular assets to particular people." },
  ],
  doc_review: [
    { label: "Type of document being reviewed", hint: "e.g. lease, NDA, settlement agreement." },
    { label: "Parties to the document", hint: "Who is involved." },
    { label: "What you want from the review", hint: "Risks, red flags, or specific clauses to check." },
  ],
  general_document: [
    { label: "Full legal name of each party", hint: "Everyone involved — people or business entities (include a registered agent if it's a company)." },
    { label: "Each party's address", hint: "Used wherever the document identifies the parties." },
    { label: "Key dates or timeline", hint: "When the relevant events happened or will happen." },
    { label: "Governing state", hint: "Which state's law applies." },
    { label: "Main purpose of the document", hint: "In one or two sentences, what it needs to accomplish." },
  ],
};

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Build the document-type-aware starter checklist (no AI call). Falls back to the
// general_document set for any unrecognized type so the pane is never empty.
export function buildStarterItems(wizardType: string): NeededItem[] {
  const fields = WIZARD_STARTER_FIELDS[wizardType] ?? WIZARD_STARTER_FIELDS.general_document;
  return fields.slice(0, 6).map((f, i) => ({
    id: `starter-${slugify(f.label)}-${i}`,
    label: f.label,
    hint: f.hint,
    severity: "helpful" as const,
  }));
}

export interface LabeledAnswer {
  label: string;
  value: string;
}

// Decide which saved starter answers can be filled DETERMINISTICALLY into the
// just-arrived draft, and which must go to a model refine pass.
//
// We only know the draft's real [[placeholders]] after it lands, and a starter
// answer's label is generic (e.g. "Your mailing address") while the draft may
// contain several address placeholders. So we fill an answer in place ONLY when
// it matches EXACTLY ONE specific placeholder — never an ambiguous or generic
// single-word one. Anything ambiguous (or unmatched, or a free-form note) is left
// for the AI pass, which has full context to place it correctly. This makes the
// deterministic path safe: it can never mis-place an answer, and at worst it
// degrades to the single AI refine pass that already existed.
//
// `byKey` is keyed by each matched placeholder's normalized full text — exactly
// the shape `applyPlaceholderAnswers` / the fill-info endpoint expect.
export function mapAnswersToPlaceholders(
  draftText: string,
  filled: LabeledAnswer[],
): { byKey: Record<string, string>; leftover: LabeledAnswer[] } {
  const placeholders = extractPlaceholders(draftText);
  const byKey: Record<string, string> = {};
  const leftover: LabeledAnswer[] = [];
  const used = new Set<string>();

  // A placeholder descriptor is "specific" (safe to match loosely) when it is
  // multi-word or reasonably long — generic tokens like "address"/"name"/"date"
  // are excluded because they routinely repeat across a document.
  const isSpecific = (key: string) => key.includes(" ") || key.length >= 7;

  for (const ans of filled) {
    const label = ans.label.replace(/\s+/g, " ").trim().toLowerCase();
    const candidates = placeholders.filter((p) => {
      if (used.has(p.dedupeKey)) return false;
      if (label === p.dedupeKey || label === p.matchKey) return true;
      if (isSpecific(p.matchKey) && (label.includes(p.matchKey) || p.matchKey.includes(label))) return true;
      return false;
    });
    // Unambiguous (exactly one target) → fill deterministically. Otherwise defer
    // to the model pass so nothing is placed in the wrong blank.
    if (candidates.length === 1) {
      byKey[candidates[0].dedupeKey] = ans.value;
      used.add(candidates[0].dedupeKey);
    } else {
      leftover.push(ans);
    }
  }

  return { byKey, leftover };
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
