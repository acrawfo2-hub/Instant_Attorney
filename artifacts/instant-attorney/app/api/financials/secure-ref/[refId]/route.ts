import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/** Permanently delete a secure identifier the caller owns. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ refId: string }> }) {
  const { refId } = await params;

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const authDb = await createClient();
    const { data: { user }, error } = await authDb.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const db = createServiceClient();
  const { data: ref } = await db.from("financial_secure_ref").select("id, user_id").eq("id", refId).maybeSingle();
  if (!ref || ref.user_id !== userId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await db.from("financial_secure_ref").delete().eq("id", refId);
  if (error) return NextResponse.json({ error: "Could not delete." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
