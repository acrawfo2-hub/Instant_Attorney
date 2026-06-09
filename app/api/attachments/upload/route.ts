import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { processAttachment } from "@/lib/attachment-processor";
import { BYPASS_USER_ID } from "@/lib/types";
import { randomUUID } from "crypto";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

export async function POST(req: NextRequest) {
  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const formData = await req.formData().catch(() => null);
  if (!formData) return NextResponse.json({ error: "Invalid form data" }, { status: 400 });

  const file = formData.get("file") as File | null;
  const caseFileId = formData.get("caseFileId") as string | null;

  if (!file || !caseFileId) {
    return NextResponse.json({ error: "file and caseFileId are required" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 25 MB limit" }, { status: 413 });
  }

  // Verify the case file belongs to this user
  const { data: caseFileRow, error: cfErr } = await db
    .from("case_files")
    .select("id")
    .eq("id", caseFileId)
    .eq("user_id", userId)
    .single();

  if (cfErr || !caseFileRow) {
    return NextResponse.json({ error: "Case file not found" }, { status: 404 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || "application/octet-stream";
  const fileId = randomUUID();
  const storagePath = `${userId}/${caseFileId}/${fileId}-${file.name}`;

  // Determine attachment type
  const attachmentType = mimeType.startsWith("image/") ? "screenshot" : "document";

  // Upload to Supabase Storage
  const serviceDb = createServiceClient();
  const { error: uploadErr } = await serviceDb.storage
    .from("case-attachments")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: false });

  if (uploadErr) {
    console.error("[attachments/upload] storage error:", uploadErr);
    return NextResponse.json({ error: "Storage upload failed" }, { status: 500 });
  }

  // Insert attachment record
  const { data: attachment, error: insertErr } = await db
    .from("attachments")
    .insert({
      case_file_id: caseFileId,
      user_id: userId,
      file_name: file.name,
      file_type: mimeType,
      file_size: file.size,
      storage_path: storagePath,
      attachment_type: attachmentType,
      status: "processing",
    })
    .select()
    .single();

  if (insertErr || !attachment) {
    console.error("[attachments/upload] insert error:", insertErr);
    return NextResponse.json({ error: "Failed to create attachment record" }, { status: 500 });
  }

  // Fire background analysis — do not await
  processAttachment(serviceDb, attachment.id, buffer, mimeType, file.name, caseFileId).catch(
    (err) => console.error("[attachments/upload] background processing error:", err)
  );

  return NextResponse.json({ id: attachment.id, status: "processing" });
}
