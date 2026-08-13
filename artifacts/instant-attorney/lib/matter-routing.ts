import { normalizeStateCode, stateName } from "./jurisdiction.ts";

/**
 * The single decision of which matter a piece of work belongs to.
 *
 * A client can have many matters — a will, then a divorce, then a contract
 * dispute — and that has always been true of the schema: `case_files.user_id` is
 * one-to-many and every document, message, fact, attachment and job keys off
 * `case_file_id`. What was missing was an owner for the question "which one is
 * this?", so `chat-acp` answered it by taking the most recently opened file:
 *
 *     .eq("user_id", userId).eq("status", "open")
 *     .order("opened_at", { ascending: false }).limit(1)
 *
 * Most-recent-wins, silently. A client with an open will matter who followed the
 * dashboard's own "Start another case" button landed on bare `/chat` and was
 * attached to the will — the button did the opposite of its label — and anything
 * they said about the new problem was extracted into the wrong Living File.
 *
 * So there is no default here. A caller either names the matter or opens one:
 *
 *   * an explicit `caseFileId` is used, once ownership is verified;
 *   * no `caseFileId` means a new matter, because every resume path in the UI
 *     passes one. `/dashboard/[id]`, the case cards, the attorney client list
 *     and the drafts table all link with `?caseFileId=`; bare `/chat` is only
 *     ever reached from "Start a new case", "Start another case", or a
 *     specialist page's `?area=` link, all of which mean *new*.
 *
 * Recency is never consulted. `matter-routing.test.ts` fails any file that pairs
 * `order("opened_at")` with `limit(1)`, which is the signature of picking a
 * working matter by recency rather than being told which one.
 */

/** How the caller identified the matter. */
export interface MatterRoutingInput {
  /** Explicit matter, from `?caseFileId=` or a stored id. Absent means "new". */
  caseFileId?: string;
  /** Quick consults are throwaway files that self-archive after a week. */
  fileType?: "standard" | "quick_consult";
  /** The client's `profiles.home_state`, seeded onto a newly opened matter. */
  homeState?: string | null;
}

export type MatterRouting =
  | { ok: true; caseFileId: string; opened: boolean }
  | { ok: false; status: number; error: string };

/** Columns a newly opened matter starts with. Exported for the routing tests. */
export function newMatterColumns(
  userId: string,
  input: { fileType?: "standard" | "quick_consult"; homeState?: string | null }
): Record<string, unknown> {
  const columns: Record<string, unknown> = { user_id: userId };

  if (input.fileType === "quick_consult") {
    columns.file_type = "quick_consult";
    columns.archive_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  }

  // Seed the forum from the client's home state so the risk gate has something
  // to check. It is a seed, not an assumption: a high-risk instrument still
  // blocks when the governing forum is genuinely unknown, and never defaults.
  const home = normalizeStateCode(input.homeState ?? null);
  if (home === "OTHER") {
    columns.jurisdiction = "Outside the United States";
  } else if (home) {
    columns.jurisdiction = stateName(home);
  }

  return columns;
}

/**
 * Resolve the matter for a turn, or open a new one. Never picks by recency.
 *
 * Ownership is verified here rather than left to RLS. RLS does stop a
 * cross-account read, but it stops it by returning no rows — which reads
 * downstream as "a matter with no facts" rather than as a refusal. An explicit
 * check fails loudly and in one place.
 */
export async function resolveMatter(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  userId: string,
  input: MatterRoutingInput
): Promise<MatterRouting> {
  if (input.caseFileId) {
    const { data: owned } = await db
      .from("case_files")
      .select("id, user_id")
      .eq("id", input.caseFileId)
      .maybeSingle();

    if (!owned) return { ok: false, status: 404, error: "Matter not found" };
    if (owned.user_id !== userId) return { ok: false, status: 403, error: "Not your matter" };

    return { ok: true, caseFileId: owned.id, opened: false };
  }

  const { data: created, error } = await db
    .from("case_files")
    .insert(newMatterColumns(userId, input))
    .select("id")
    .single();

  if (error || !created) {
    console.error("[matter-routing] could not open a matter:", error);
    return { ok: false, status: 500, error: "Failed to open a new matter" };
  }

  return { ok: true, caseFileId: created.id, opened: true };
}
