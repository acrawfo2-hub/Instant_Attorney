import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = await createClient();

  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await db
    .from("profiles")
    .select("is_attorney")
    .eq("id", user.id)
    .single();

  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only the owning client or an attorney can view
  if (doc.user_id !== user.id && !profile?.is_attorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(doc);
}
