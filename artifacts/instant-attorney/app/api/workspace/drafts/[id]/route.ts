import { NextRequest, NextResponse } from "next/server";
import { getClientContext } from "@/lib/client-workspace-auth";
import { createServiceClient } from "@/lib/supabase/server";
import { startDocumentReview } from "@/lib/attorney-review";
import { saveDocumentRevision } from "@/lib/document-persistence";
import { draftRevisionAction, nextRevisionMetadata, revisionUiMessage } from "@/lib/workspace-draft-revision";
import type { ClientWorkspaceDraft, DocumentStatus } from "@/lib/types";

// Edit a consumer freestyle draft in place. A client edit flips source to
// 'client' so a later same-title regeneration doesn't silently overwrite
// hand-written changes.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getClientContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { title, content } = await req.json().catch(() => ({})) as { title?: string; content?: string };

  // Resolve the promotion before writing either row. A promoted workspace draft
  // is one editor for the review document, not an independent copy.
  const { data: existingRow } = await ctx.db
    .from("client_workspace_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const existing = existingRow as ClientWorkspaceDraft | null;
  if (!existing) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  const savedTitle = typeof title === "string" ? title.trim() || "Untitled draft" : existing.title;
  const savedContent = typeof content === "string" ? content : existing.content;
  const now = new Date().toISOString();
  let revisionAction = draftRevisionAction(null);
  let promotedDocumentId = existing.promoted_document_id;

  if (promotedDocumentId) {
    const serviceDb = createServiceClient();
    const { data: linked } = await serviceDb.from("documents")
      .select("id, case_file_id, user_id, status, doc_type, content_json")
      .eq("id", promotedDocumentId).eq("user_id", ctx.userId).maybeSingle();
    if (!linked) return NextResponse.json({ error: "The linked review document no longer exists." }, { status: 409 });
    revisionAction = draftRevisionAction(linked.status as DocumentStatus);

    if (revisionAction === "create_revision") {
      let saved: { documentId: string };
      try {
        saved = await saveDocumentRevision(serviceDb, {
          caseFileId: linked.case_file_id,
          userId: ctx.userId,
          draftText: savedContent,
          persist: async () => {
            const { data: revision, error } = await serviceDb.from("documents").insert({
              case_file_id: linked.case_file_id,
              user_id: ctx.userId,
              doc_type: linked.doc_type,
              title: savedTitle,
              draft_text: savedContent,
              content_json: nextRevisionMetadata(linked.content_json, now, linked.id),
              status: "pending_review",
              submitted_at: now,
              updated_at: now,
            }).select("id").single();
            if (error || !revision) throw error ?? new Error("Revision insert returned no row");
            return revision.id;
          },
        });
      } catch {
        return NextResponse.json({ error: "Could not create a safe revision." }, { status: 500 });
      }
      promotedDocumentId = saved.documentId;
      await startDocumentReview(saved.documentId, linked.case_file_id);
    } else {
      // A running model call cannot be cancelled, so make its row terminal first;
      // its eventual writes are also superseded by the fresh run and child reset.
      await serviceDb.from("document_review_runs").update({
        status: "failed", stage: "superseded", error: "Superseded by client workspace revision", updated_at: now,
      }).eq("document_id", linked.id).in("status", ["queued", "running", "awaiting_attorney"]);
      await serviceDb.from("document_improvements").update({ status: "superseded" })
        .eq("document_id", linked.id).eq("status", "proposed");
      await serviceDb.from("documents").delete().eq("parent_document_id", linked.id)
        .in("doc_type", ["critical_review", "second_draft"]);
      try {
        await saveDocumentRevision(serviceDb, {
          caseFileId: linked.case_file_id,
          userId: ctx.userId,
          draftText: savedContent,
          persist: async () => {
            const { error } = await serviceDb.from("documents").update({
              title: savedTitle,
              draft_text: savedContent,
              content_json: nextRevisionMetadata(linked.content_json, now),
              status: "pending_review",
              submitted_at: now,
              review_status: null,
              reviewed_at: null,
              reviewed_by: null,
              updated_at: now,
            }).eq("id", linked.id).eq("user_id", ctx.userId);
            if (error) throw error;
            return linked.id;
          },
        });
      } catch {
        return NextResponse.json({ error: "Could not save the linked document revision." }, { status: 500 });
      }
      await startDocumentReview(linked.id, linked.case_file_id);
    }
  }

  const update: Record<string, unknown> = {
    updated_at: now, source: "client", title: savedTitle, content: savedContent, promoted_document_id: promotedDocumentId,
  };

  const { data, error } = await ctx.db
    .from("client_workspace_drafts")
    .update(update)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select()
    .single();

  if (error || !data) {
    console.error("[workspace/drafts] update error:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
  return NextResponse.json({ draft: {
    ...data,
    revision_action: revisionAction,
    attorney_review_pending: revisionAction !== "unpromoted",
    revision_notice: revisionUiMessage(revisionAction),
  } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getClientContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await ctx.db
    .from("client_workspace_drafts")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) {
    console.error("[workspace/drafts] delete error:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
