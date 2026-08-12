import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { saveDocumentRevision } from "@/lib/document-persistence";

async function attorney() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const { data } = await db.from("profiles").select("is_attorney").eq("id", user.id).single();
  return data?.is_attorney ? user : null;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await attorney();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const { data, error } = await createServiceClient().from("document_revisions")
    .select("*").eq("document_id", id).order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ revisions: data ?? [] });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await attorney();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const body = await req.json() as { revisionId?: string; action?: "restore" | "branch" };
  if (!body.revisionId || !["restore", "branch"].includes(body.action ?? ""))
    return NextResponse.json({ error: "Invalid revision operation" }, { status: 400 });
  const db = createServiceClient();
  const { data: source } = await db.from("document_revisions").select("*")
    .eq("id", body.revisionId).eq("document_id", id).single();
  if (!source) return NextResponse.json({ error: "Revision not found" }, { status: 404 });
  const { data: doc } = await db.from("documents").select("title,draft_text,status,case_file_id,user_id").eq("id", id).single();
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  if (body.action === "restore" && ["approved", "delivered"].includes(doc.status))
    return NextResponse.json({ error: "Approved and delivered documents cannot be overwritten; branch instead." }, { status: 409 });

  let parent = source.id;
  if (body.action === "restore") {
    const { data: before } = await db.from("document_revisions").insert({ document_id: id,
      parent_revision_id: source.id, content: doc.draft_text ?? "", title: doc.title,
      author_type: "attorney", attorney_id: user.id, source_action: "manual_restore_before",
      summary: `Checkpoint before restoring ${source.id}` }).select("id").single();
    parent = before?.id ?? source.id;
    // Restoring puts different text in front of the client, so it is a document
    // save like any other and goes through the boundary. Branching does not
    // touch the document, which is why only this arm calls it.
    await saveDocumentRevision(db, {
      caseFileId: doc.case_file_id,
      userId: doc.user_id,
      draftText: source.content,
      persist: async () => {
        await db.from("documents").update({ draft_text: source.content, title: source.title,
          updated_at: new Date().toISOString() }).eq("id", id);
        return id;
      },
    });
  }
  const { data: revision, error } = await db.from("document_revisions").insert({
    document_id: id, parent_revision_id: parent, content: source.content, title: source.title,
    author_type: "attorney", attorney_id: user.id,
    source_action: body.action === "restore" ? "manual_restore_after" : "branch",
    summary: body.action === "restore" ? `Restored from ${source.id}` : `Branched from ${source.id}`,
  }).select("*").single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await db.from("document_working_buffers").upsert({ document_id: id, base_revision_id: revision.id,
    content: source.content, title: source.title, updated_by: user.id, updated_at: new Date().toISOString() });
  return NextResponse.json({ revision });
}
