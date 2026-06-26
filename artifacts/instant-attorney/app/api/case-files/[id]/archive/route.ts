import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const QUICK_CONSULT_ARCHIVE_DAYS = 7;
const STANDARD_ARCHIVE_DAYS = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { data: file } = await db
    .from("case_files")
    .select("id, file_type, status")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (file.status === "archived") return NextResponse.json({ error: "Already archived" }, { status: 400 });

  const days = file.file_type === "quick_consult" ? QUICK_CONSULT_ARCHIVE_DAYS : STANDARD_ARCHIVE_DAYS;
  const archiveAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  await db.from("case_files").update({
    status: "archived",
    archive_at: archiveAt,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.json({ ok: true });
}
