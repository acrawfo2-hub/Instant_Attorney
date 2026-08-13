import type { DeckAction } from "./file-deck.ts";

// Editorial rules for the client cover sheet. Kept out of the React component
// so the field-picking can be tested without a DOM: an expert attorney's one
// page, not a dump of whatever the model wrote first.
//
// Chat is the door. A draft or an upload may be the work, but the assistant
// is how the client gets there — the cover never sends them somewhere else.

const UNCONFIRMED = /unconfirmed|^$/i;

/** Seeded into the composer when the cover has no more specific next-step ask. */
export const COVER_CHAT_ASK = "Help me from my cover sheet — what should I do next?";

export function coverForum(jurisdiction: string | null | undefined): string {
  const raw = jurisdiction?.trim() ?? "";
  if (!raw || UNCONFIRMED.test(raw)) return "State not confirmed";
  return raw;
}

export function coverMatter(matterSubtype: string | null | undefined): string {
  const raw = matterSubtype?.trim();
  if (!raw) return "Intake in progress";
  return raw.replace(/_/g, " ");
}

/** One-line caption: "Divorce · Texas" / "Intake in progress · State not confirmed". */
export function coverCaption(
  matterSubtype: string | null | undefined,
  jurisdiction: string | null | undefined,
): string {
  return `${coverMatter(matterSubtype)} · ${coverForum(jurisdiction)}`;
}

export function coverGoal(goals: string[] | null | undefined): string {
  const first = goals?.find((g) => g.trim().length > 0)?.trim();
  return first ?? "We'll pin this down as we talk.";
}

/** Posture only — never blend strategy or a strength headline into this. */
export function coverStanding(summary: string | null | undefined, maxSentences = 3): string {
  if (!summary?.trim()) return "";
  const parts = (summary.trim().match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, maxSentences);
  return parts.join(" ");
}

export type CoverCatch =
  | { kind: "gap"; text: string }
  | { kind: "risk"; text: string }
  | { kind: "untested"; text: string };

/**
 * One catch, never a silent empty. A blocking gap outranks a strategy risk;
 * an unrun strength check is said out loud so "no risks listed" cannot read
 * as "you're fine."
 */
export function coverCatch(blockingGap: string | null, strategyRisk: string | null): CoverCatch {
  if (blockingGap?.trim()) return { kind: "gap", text: blockingGap.trim() };
  if (strategyRisk?.trim()) return { kind: "risk", text: strategyRisk.trim() };
  return { kind: "untested", text: "We have not pressure-tested this yet." };
}

export function askHref(chatHref: string, ask: string): string {
  const separator = chatHref.includes("?") ? "&" : "?";
  return `${chatHref}${separator}ask=${encodeURIComponent(ask)}`;
}

/**
 * Every cover action opens chat. The ask is the next-step sentence when we
 * have one; otherwise the default cover ask. Chat is the door — not a fallback.
 */
export function coverActionHref(
  chatHref: string,
  action: Pick<DeckAction, "ask"> | null,
  fallbackAsk?: string | null,
): string {
  const ask = action?.ask ?? fallbackAsk ?? COVER_CHAT_ASK;
  return askHref(chatHref, ask);
}

export function matchingAction(
  actions: DeckAction[],
  title: string | null | undefined,
): DeckAction | null {
  if (!title) return null;
  const key = title.trim().toLowerCase();
  return actions.find((a) => a.label.toLowerCase() === key) ?? null;
}

export interface CoverBriefingInput {
  matterSubtype?: string | null;
  jurisdiction?: string | null;
  goals?: string[] | null;
  summary?: string | null;
  blockingGap?: string | null;
  strategyRisk?: string | null;
  nextStep?: string | null;
}

/**
 * The same one-page the client just read, for the orchestrator. Not a second
 * summary engine — the same field-picking as ClientCaseMemo.
 */
export function formatCoverBriefing(input: CoverBriefingInput): string {
  const catchLine = coverCatch(input.blockingGap ?? null, input.strategyRisk ?? null);
  const standing = coverStanding(input.summary);
  return [
    "=== CLIENT COVER SHEET ===",
    "The client just read this one-page. Meet them there. Help them do the next step and close the catch. Do not re-read the cover back to them unless they ask.",
    `Caption: ${coverCaption(input.matterSubtype, input.jurisdiction)}`,
    `What they do now: ${input.nextStep?.trim() || "Not yet pinned — help them find the next step."}`,
    `What they want: ${coverGoal(input.goals)}`,
    `Where things stand: ${standing || "Not yet written."}`,
    `The catch: ${catchLine.text}`,
    "=== END COVER SHEET ===",
    "",
  ].join("\n");
}
