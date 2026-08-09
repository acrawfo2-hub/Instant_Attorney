import type { ClientWorkspaceDraft } from "./types.ts";

// ─────────────────────────────────────────────────────────────────────────────
// Which draft the side panel should show.
//
// Pulled out of ChatDraftsPanel because this is the logic behind "I clicked the
// draft and it didn't open." Three distinct outcomes used to collapse into one
// silent state (an empty panel that reads as "you have no drafts"):
//
//   · the fetch failed            → say so, offer a retry
//   · the fetch hasn't landed yet → say so, don't claim the list is empty
//   · the requested draft is gone → say so, don't silently show a different one
//
// Selecting the wrong document without telling anyone is the worst of these: on
// a legal file, quietly showing document B when the client asked for document A
// is not a cosmetic bug.
// ─────────────────────────────────────────────────────────────────────────────

/** A one-shot "jump to this draft" request from a chip click or a ?draft= link. */
export interface DraftFocusRequest {
  id?: string | null;
  title?: string | null;
}

export type DraftFocusOutcome =
  /** No pending request — selection follows the normal rules. */
  | { kind: "none"; activeId: string | null }
  /** The requested draft was found and selected. */
  | { kind: "focused"; activeId: string }
  /** A draft was asked for by id/title and is not in the list. */
  | { kind: "missing"; activeId: string | null; requested: string };

/**
 * Decide the active draft after a load.
 *
 * @param list      drafts as returned by the server, newest first
 * @param current   the currently selected id, if any
 * @param focus     a pending jump request, or null
 */
export function resolveDraftFocus(
  list: ClientWorkspaceDraft[],
  current: string | null,
  focus: DraftFocusRequest | null,
): DraftFocusOutcome {
  // Keeping the current selection when it still exists matters: a background
  // refresh (the assistant just wrote a new draft) must not yank the client off
  // the document they are reading.
  const fallback = current && list.some((d) => d.id === current) ? current : (list[0]?.id ?? null);

  const wantsId = focus?.id?.trim() || null;
  const wantsTitle = focus?.title?.trim() || null;
  if (!wantsId && !wantsTitle) return { kind: "none", activeId: fallback };

  // Id wins over title — a title is only a display label and two drafts can
  // legitimately share one.
  const match =
    (wantsId ? list.find((d) => d.id === wantsId) : undefined) ??
    (wantsTitle ? list.find((d) => d.title === wantsTitle) : undefined);

  if (match) return { kind: "focused", activeId: match.id };

  return { kind: "missing", activeId: fallback, requested: wantsTitle ?? wantsId ?? "" };
}

/** The message shown when a requested draft could not be found. */
export function missingDraftNotice(requested: string, hasOthers: boolean): string {
  const named = requested ? `“${requested}”` : "That draft";
  return hasOthers
    ? `${named} isn’t in your drafts any more — it may have been sent to your attorney or deleted. Showing your most recent draft instead.`
    : `${named} isn’t in your drafts any more — it may have been sent to your attorney or deleted. Check your case file under “Documents”.`;
}
