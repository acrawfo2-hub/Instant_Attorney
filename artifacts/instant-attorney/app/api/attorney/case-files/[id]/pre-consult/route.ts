import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generatePreConsultMemo } from "@/lib/pre-consult-generate";
import { BYPASS_USER_ID } from "@/lib/types";

export const maxDuration = 300;

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

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

  try {
    const { memo, truncated } = await generatePreConsultMemo(db, id, userId);
    return NextResponse.json({ pre_consult_memo: memo, truncated });
  } catch (err) {
    console.error("[attorney/pre-consult] error:", err);
    const message = err instanceof Error && err.message === "Case file not found"
      ? "Case file not found"
      : "Memo generation failed";
    const status = message === "Case file not found" ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
