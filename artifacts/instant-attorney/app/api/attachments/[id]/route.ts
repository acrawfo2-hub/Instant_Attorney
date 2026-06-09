import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

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

  const { data: attachment, error } = await db
    .from("attachments")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !attachment) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Check ownership (attorneys bypass via RLS, users must own)
  const isOwner = attachment.user_id === userId;
  if (!isOwner) {
    const { data: profile } = await db
      .from("profiles")
      .select("is_attorney")
      .eq("id", userId)
      .single();
    if (!profile?.is_attorney) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // Generate a short-lived signed URL for download
  const serviceDb = createServiceClient();
  const { data: signedData } = await serviceDb.storage
    .from("case-attachments")
    .createSignedUrl(attachment.storage_path, 300); // 5 minutes

  return NextResponse.json({
    ...attachment,
    signed_url: signedData?.signedUrl ?? null,
  });
}
