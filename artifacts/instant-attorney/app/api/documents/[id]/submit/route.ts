import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { finalizeDocumentSubmission } from "@/lib/document-utils";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const authDb = await createClient();
    const { data: { user }, error } = await authDb.auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  // finalizeDocumentSubmission enforces ownership via explicit `.eq("user_id",
  // userId)` filters on every query, so we run it on the service client. RLS on
  // `documents` in the live DB blocks the user-scoped client's UPDATE (it matched
  // 0 rows → submission silently 404'd even though the draft existed and was the
  // caller's). This is the same client bypass mode already uses.
  const db = createServiceClient();

  const { data: candidate } = await db
    .from("documents")
    .select("content_json")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if ((candidate?.content_json as Record<string, unknown> | null)?.generation_incomplete === true) {
    return NextResponse.json(
      { error: "Regenerate the complete draft before submitting it for review." },
      { status: 409 }
    );
  }

  const doc = await finalizeDocumentSubmission(db, id, userId);

  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    submitted_at: doc.submitted_at,
    status: doc.status,
  });
}
