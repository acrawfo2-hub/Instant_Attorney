// Parsing helpers for the freestyle side-panel draft protocol. The associate
// wraps standalone deliverables in ---DRAFT: <title>--- ... ---END DRAFT--- blocks
// (see ATTORNEY_FREESTYLE_HEAD in prompts.ts). The chat route persists them to
// attorney_workspace_drafts; the UI strips them from the message body and shows
// a chip instead, so the document lives in the editable right-hand panel rather
// than scrolling away in chat.

export interface ParsedDraft {
  title: string;
  content: string;
}

// A [[placeholder — descriptor]] the drafter left for a still-unknown value.
export interface DraftBlank {
  raw: string;   // the full "[[…]]" as it appears in the text
  index: number; // character offset of the first occurrence
  label: string; // inner descriptor, trimmed and length-capped for display
}

/** Pull every DISTINCT [[double-bracket]] blank out of a draft, in order, so a
 *  panel can show the reader exactly what the draft is still missing. */
export function findBlanks(text: string): DraftBlank[] {
  const seen = new Map<string, number>();
  const re = /\[\[([^\]]+)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!seen.has(m[0])) seen.set(m[0], m.index);
  }
  return [...seen.entries()].map(([raw, index]) => {
    const inner = raw.replace(/^\[\[/, "").replace(/\]\]$/, "").trim();
    return { raw, index, label: inner.length > 34 ? inner.slice(0, 32) + "…" : inner };
  });
}

// Matches a full draft block. Tolerant of trailing spaces on the fence lines and
// of the block appearing anywhere in the text. The body is lazy so back-to-back
// drafts each match their own ---END DRAFT---.
const DRAFT_BLOCK = /---DRAFT:[ \t]*(.*?)[ \t]*---\r?\n([\s\S]*?)\r?\n?---END DRAFT---/g;
const DRAFT_OPEN = /---DRAFT:[ \t]*(.*?)[ \t]*---/;

/** Pull every completed draft block out of an assistant message. */
export function parseDrafts(text: string): ParsedDraft[] {
  const drafts: ParsedDraft[] = [];
  for (const m of text.matchAll(DRAFT_BLOCK)) {
    const title = (m[1] || "").trim() || "Untitled draft";
    const content = (m[2] || "").trim();
    if (content) drafts.push({ title, content });
  }
  return drafts;
}

/**
 * Remove draft blocks from an assistant message for chat display — the document
 * itself lives in the side panel, so only the conversational text stays in the
 * transcript (callers render a chip from parseDrafts separately). An as-yet-
 * unclosed block (still streaming) is dropped so the half-written document
 * doesn't flash in the transcript.
 */
export function stripDraftsForDisplay(text: string): string {
  let out = text.replace(DRAFT_BLOCK, "");
  const openIdx = out.search(DRAFT_OPEN);
  if (openIdx !== -1 && !/---END DRAFT---/.test(out.slice(openIdx))) {
    out = out.slice(0, openIdx).trimEnd();
  }
  // Collapse the blank gap a removed block leaves behind.
  return out.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * True while an assistant message has an opened draft fence but no closing fence
 * yet — a draft is actively streaming into existence. Lets the UI show a
 * "writing draft" affordance instead of nothing.
 */
export function hasOpenDraft(text: string): boolean {
  const openIdx = text.search(DRAFT_OPEN);
  return openIdx !== -1 && !/---END DRAFT---/.test(text.slice(openIdx));
}
