import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Merge a quick_consult file into a target standard file.
// Moves messages, attachments, fact_items, and requested_attachments.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sourceId } = await params;
  const { targetCaseFileId, saveAsNew } = await req.json() as {
    targetCaseFileId?: string;
    saveAsNew?: boolean;
  };

  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    const { createServiceClient } = await import("@/lib/supabase/server");
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  // Verify the source file belongs to the user
  const { data: sourceFile } = await db
    .from("case_files")
    .select("id, file_type, summary, matter_type, matter_subtype")
    .eq("id", sourceId)
    .eq("user_id", userId)
    .single();

  if (!sourceFile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // "Save as New File" — just convert the quick_consult to a standard file
  if (saveAsNew) {
    await db.from("case_files").update({
      file_type: "standard",
      archive_at: null,
      updated_at: new Date().toISOString(),
    }).eq("id", sourceId);
    return NextResponse.json({ ok: true, caseFileId: sourceId });
  }

  // "Link to Existing File" — merge into target
  if (!targetCaseFileId) {
    return NextResponse.json({ error: "targetCaseFileId required" }, { status: 400 });
  }

  const { data: targetFile } = await db
    .from("case_files")
    .select("id")
    .eq("id", targetCaseFileId)
    .eq("user_id", userId)
    .single();

  if (!targetFile) return NextResponse.json({ error: "Target not found" }, { status: 404 });

  // Move all related records to the target file
  await Promise.all([
    db.from("intake_messages").update({ case_file_id: targetCaseFileId }).eq("case_file_id", sourceId),
    db.from("attachments").update({ case_file_id: targetCaseFileId }).eq("case_file_id", sourceId),
    db.from("fact_items").update({ case_file_id: targetCaseFileId }).eq("case_file_id", sourceId),
    db.from("requested_attachments").update({ case_file_id: targetCaseFileId }).eq("case_file_id", sourceId),
  ]);

  // Close the source quick_consult file
  await db.from("case_files").update({
    status: "closed",
    updated_at: new Date().toISOString(),
  }).eq("id", sourceId);

  return NextResponse.json({ ok: true, caseFileId: targetCaseFileId });
}
