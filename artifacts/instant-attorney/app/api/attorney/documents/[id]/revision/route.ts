import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getChildDocuments, getSecondDraftChild } from "@/lib/document-utils";
import { saveDocumentRevision } from "@/lib/document-persistence";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { text } = await req.json().catch(() => ({ text: null })) as { text?: unknown };
  if (typeof text !== "string") return NextResponse.json({ error: "Revision text is required" }, { status: 400 });

  const authDb = BYPASS_AUTH ? createServiceClient() : await createClient();
  let actorId = BYPASS_USER_ID;
  if (!BYPASS_AUTH) {
    const { data: { user } } = await (authDb as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    actorId = user.id;
  }
  const { data: profile } = await authDb.from("profiles").select("is_attorney").eq("id", actorId).single();
  if (!profile?.is_attorney) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const db = createServiceClient();
  const { data: parentRow } = await db.from("documents").select("*").eq("id", id).is("parent_document_id", null).single();
  if (!parentRow) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  const parent = parentRow as Document;
  const existing = getSecondDraftChild(await getChildDocuments(db, id));
  const now = new Date().toISOString();
  // #118's revision boundary belongs here rather than on chat-edit. Under #123
  // the partner only proposes; this endpoint is where an attorney's accepted
  // edit is actually written, so it is the write that must carry a revision id
  // and drive the durable Living File sync.
  let saved: { id: string; draft_text: string | null; updated_at: string } | null = null;
  let conflict = false;
  const revision = await saveDocumentRevision(db, {
    caseFileId: parent.case_file_id, userId: parent.user_id, draftText: text,
    persist: async () => {
      if (existing) {
        const { data, error } = await db.from("documents").update({ draft_text: text, updated_at: now })
          .eq("id", existing.id).select("id, draft_text, updated_at").single();
        if (error) throw error;
        saved = data;
        await db.from("documents").update({ improved_draft_text: text, updated_at: now }).eq("id", id);
        return data.id;
      }
      const { data, error } = await db.from("documents").insert({
        case_file_id: parent.case_file_id, user_id: parent.user_id, parent_document_id: id,
        doc_type: "second_draft", title: `${parent.title} — Attorney Working Copy`,
        status: "draft", draft_text: text, content_json: { source: "manual_working_copy" },
      }).select("id, draft_text, updated_at").single();
      if (error) { conflict = error.code === "23505"; throw error; }
      saved = data;
      await db.from("documents").update({ improved_draft_text: text, updated_at: now }).eq("id", id);
      return data.id;
    },
  }).catch(() => null);

  if (!revision || !saved) {
    return NextResponse.json(
      { error: conflict ? "The revision changed in another tab. Reload and try again." : "Revision could not be saved" },
      { status: conflict ? 409 : 500 },
    );
  }
  return NextResponse.json({ revision: saved, livingFileSyncPending: revision.syncPending }, { status: existing ? 200 : 201 });
}

// sendBeacon uses POST while unloading; it shares the exact attorney-only save path.
export const POST = PATCH;
