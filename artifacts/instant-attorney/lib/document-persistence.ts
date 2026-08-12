import type { SupabaseClient } from "@supabase/supabase-js";
import { syncDraftGapsToLivingFile } from "./file-parser.ts";

export type PersistDocumentRevision = (revisionId: string) => Promise<string>;

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
