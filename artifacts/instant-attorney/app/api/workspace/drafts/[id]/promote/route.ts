import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getClientContext } from "@/lib/client-workspace-auth";
import { finalizeDocumentSubmission } from "@/lib/document-utils";
import type { ClientWorkspaceDraft } from "@/lib/types";

// Promote a freestyle workspace draft into the documents pipeline and submit it
// for the 48-hour attorney review. Idempotent: a draft already linked to a
// document just returns that document. This is the bridge that keeps the
// wide-open brainstorm connected to the real review flow — nothing enters the
// attorney queue until the client deliberately sends it.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getClientContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data: draftRow } = await ctx.db
    .from("client_workspace_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const draft = draftRow as ClientWorkspaceDraft | null;
  if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });

  if (!draft.content.trim()) {
    return NextResponse.json({ error: "This draft is empty." }, { status: 400 });
  }

  // Document writes run on the service client — `documents` RLS blocks the
  // user-scoped UPDATE (same rationale as the submit route). Ownership is
  // enforced by the explicit user_id filters here and inside finalize.
  const serviceDb = createServiceClient();

  // Already promoted? Re-submit the existing document rather than duplicating.
  if (draft.promoted_document_id) {
    const { data: linked } = await serviceDb.from("documents")
      .select("id, status, content_json")
      .eq("id", draft.promoted_document_id).eq("user_id", ctx.userId).maybeSingle();
    if (linked?.status === "approved" || linked?.status === "delivered") {
      return NextResponse.json({
        error: "This version is already approved. Edit the workspace draft to create a new review revision.",
      }, { status: 409 });
    }
    // Idempotent does not mean stale: always copy the editor's latest saved text
    // before resubmitting (notably after an attorney requests changes).
    if (linked) {
      const now = new Date().toISOString();
      await serviceDb.from("documents").update({
        title: draft.title, draft_text: draft.content, updated_at: now,
      }).eq("id", linked.id).eq("user_id", ctx.userId);
    }
    const doc = await finalizeDocumentSubmission(serviceDb, draft.promoted_document_id, ctx.userId);
    if (doc) return NextResponse.json({ documentId: doc.id, status: doc.status, reused: true });
    // The linked doc vanished — fall through and create a fresh one.
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insErr } = await serviceDb
    .from("documents")
    .insert({
      case_file_id: draft.case_file_id,
      user_id: ctx.userId,
      doc_type: "general_document",
      title: draft.title,
      draft_text: draft.content,
      content_json: { source: "freestyle_workspace", workspace_draft_id: draft.id },
      status: "draft",
      updated_at: now,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    console.error("[workspace/drafts/promote] insert error:", insErr);
    return NextResponse.json({ error: "Could not create the document" }, { status: 500 });
  }

  const doc = await finalizeDocumentSubmission(serviceDb, inserted.id, ctx.userId);
  if (!doc) {
    // Attorney-user accounts have no review queue; keep the draft as the doc's home.
    return NextResponse.json({ error: "This account cannot submit documents for review." }, { status: 400 });
  }

  await serviceDb
    .from("client_workspace_drafts")
    .update({ promoted_document_id: doc.id, updated_at: now })
    .eq("id", draft.id)
    .eq("user_id", ctx.userId);

  return NextResponse.json({ documentId: doc.id, status: doc.status });
}
