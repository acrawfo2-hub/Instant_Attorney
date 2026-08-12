import type { SupabaseClient } from "@supabase/supabase-js";
import type { DocumentStatus } from "./types.ts";
import { syncDraftGapsToLivingFile } from "./file-parser.ts";

export type PersistDocumentRevision = (revisionId: string) => Promise<string>;

export type FillLifecycle = "draft_in_place" | "review_revision" | "approval_revision";

/**
 * Which lifecycle a placeholder fill follows, given the document's status.
 *
 * Lives here rather than in its own module so that document revision policy has
 * one home alongside the write boundary it governs. It decides how the fill is
 * *recorded* — whether the client's own draft is amended in place, or the fill
 * produces a revision that re-enters review, or it revises text an attorney had
 * already approved.
 *
 * It does not decide the resulting status. `apply_document_placeholder_revision`
 * does, in SQL (`status = case when needs_review then 'pending_review' else
 * 'draft' end`), and there used to be a `statusAfterPlaceholderFill` here saying
 * the same thing in TypeScript. Nothing called it — the RPC had always owned
 * that write — so it was a second copy of a rule that could drift from the one
 * that runs. Do not reintroduce it; read the migration instead.
 */
export function placeholderFillLifecycle(status: DocumentStatus): FillLifecycle {
  if (status === "draft" || status === "pre_warmed") return "draft_in_place";
  if (status === "approved" || status === "delivered") return "approval_revision";
  return "review_revision";
}

/** The single persistence boundary for generated/revised document text. */
export async function saveDocumentRevision(
  db: SupabaseClient,
  input: { caseFileId: string; userId: string; draftText: string; persist: PersistDocumentRevision }
): Promise<{ documentId: string; revisionId: string; syncPending: boolean }> {
  const revisionId = crypto.randomUUID();
  const documentId = await input.persist(revisionId);

  await db.from("documents").update({
    living_file_sync_status: "pending",
    living_file_sync_error: null,
    current_revision_id: revisionId,
  }).eq("id", documentId);

  try {
    await syncDraftGapsToLivingFile(db, input.caseFileId, input.userId, input.draftText, {
      documentId,
      revisionId,
    });
    const { error } = await db.from("documents").update({
      living_file_sync_status: "synced",
      living_file_sync_error: null,
      living_file_synced_at: new Date().toISOString(),
    }).eq("id", documentId);
    if (error) throw error;
    return { documentId, revisionId, syncPending: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.from("documents").update({
      living_file_sync_status: "failed",
      living_file_sync_error: message.slice(0, 1000),
    }).eq("id", documentId);
    return { documentId, revisionId, syncPending: true };
  }
}

/** Retry a durable pending/failed synchronization without creating a revision. */
export async function retryDocumentLivingFileSync(db: SupabaseClient, documentId: string) {
  const { data: doc, error } = await db.from("documents")
    .select("id, case_file_id, user_id, draft_text, current_revision_id")
    .eq("id", documentId).single();
  if (error || !doc?.draft_text || !doc.current_revision_id) throw error ?? new Error("Document revision is unavailable");
  await db.from("documents").update({ living_file_sync_status: "pending" }).eq("id", documentId);
  try {
    await syncDraftGapsToLivingFile(db, doc.case_file_id, doc.user_id, doc.draft_text, {
      documentId, revisionId: doc.current_revision_id,
    });
    const { error: updateError } = await db.from("documents").update({
      living_file_sync_status: "synced", living_file_sync_error: null,
      living_file_synced_at: new Date().toISOString(),
    }).eq("id", documentId);
    if (updateError) throw updateError;
  } catch (syncError) {
    await db.from("documents").update({
      living_file_sync_status: "failed",
      living_file_sync_error: (syncError instanceof Error ? syncError.message : String(syncError)).slice(0, 1000),
    }).eq("id", documentId);
    throw syncError;
  }
}
