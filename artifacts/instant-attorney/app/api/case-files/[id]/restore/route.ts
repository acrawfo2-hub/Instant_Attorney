import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MAX_ACTIVE_FILES = 10;

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

  // Check current active file count
  const { count } = await db
    .from("case_files")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "open");

  if ((count ?? 0) >= MAX_ACTIVE_FILES) {
    return NextResponse.json(
      { error: `You have ${MAX_ACTIVE_FILES} active files. Archive one before restoring.` },
      { status: 400 }
    );
  }

  const { data: file } = await db
    .from("case_files")
    .select("id, status")
    .eq("id", id)
    .eq("user_id", userId)
    .single();

  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await db.from("case_files").update({
    status: "open",
    archive_at: null,
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  return NextResponse.json({ ok: true });
}
