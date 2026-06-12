import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getChildDocuments } from "@/lib/document-utils";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/**
 * Second-draft generation is wired for future use. The generation prompt and
 * model selection will be finalized before this endpoint calls Anthropic.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  const { data: parent } = await db
    .from("documents")
    .select("*")
    .eq("id", id)
    .is("parent_document_id", null)
    .single();

  if (!parent) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const children = await getChildDocuments(db, id);
  const criticalReview = children.find((c) => c.doc_type === "critical_review");

  return NextResponse.json(
    {
      error: "Second draft generation is not yet enabled. Your instructions are saved and will be used when this feature launches.",
      ready: false,
      has_first_draft: !!parent.draft_text,
      has_critical_review: !!criticalReview?.draft_text,
      has_attorney_prompt: !!parent.attorney_second_draft_prompt?.trim(),
    },
    { status: 501 }
  );
}
