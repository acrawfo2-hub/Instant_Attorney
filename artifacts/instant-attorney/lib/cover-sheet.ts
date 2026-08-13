import type { DeckAction } from "./file-deck.ts";

// Editorial rules for the client cover sheet. Kept out of the React component
// so the field-picking can be tested without a DOM: an expert attorney's one
// page, not a dump of whatever the model wrote first.

const UNCONFIRMED = /unconfirmed|^$/i;

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
 * Open the paper or the upload when that is the job. Chat is the fallback,
 * not the default for a draft sitting on the desk.
 */
export function coverActionHref(
  chatHref: string,
  caseFileId: string,
  action: Pick<DeckAction, "kind" | "draftId" | "ask"> | null,
  fallbackAsk?: string | null,
): string {
  if (action?.kind === "draft" && action.draftId) {
    return `/chat?caseFileId=${caseFileId}&draft=${action.draftId}`;
  }
  if (action?.kind === "upload") {
    return `/dashboard/${caseFileId}?view=documents#uploads`;
  }
  const ask = action?.ask ?? fallbackAsk;
  if (ask) return askHref(chatHref, ask);
  return chatHref;
}

export function matchingAction(
  actions: DeckAction[],
  title: string | null | undefined,
): DeckAction | null {
  if (!title) return null;
  const key = title.trim().toLowerCase();
  return actions.find((a) => a.label.toLowerCase() === key) ?? null;
}
