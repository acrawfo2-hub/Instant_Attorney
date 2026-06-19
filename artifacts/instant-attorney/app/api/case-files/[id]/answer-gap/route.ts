import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Promote a Living File gap to a confirmed fact when the client answers inline
// from Mission Control (or the fact-gaps section).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: caseFileId } = await params;
  const body = await req.json().catch(() => null);
  const factId = body?.factId;
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";

  if (!factId || !answer) {
    return NextResponse.json({ error: "factId and answer are required" }, { status: 400 });
  }

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

    const { data: ownedCase } = await db
      .from("case_files")
      .select("id")
      .eq("id", caseFileId)
      .eq("user_id", userId)
      .maybeSingle();
    if (!ownedCase) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { data: gapRow, error: gapErr } = await db
    .from("fact_items")
    .select("id, description, status, case_file_id")
    .eq("id", factId)
    .eq("case_file_id", caseFileId)
    .eq("user_id", userId)
    .single();

  if (gapErr || !gapRow) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (gapRow.status !== "gap") {
    return NextResponse.json({ error: "This item is not an open gap" }, { status: 400 });
  }

  const label = gapRow.description.trim();
  const description = label.includes(":") ? `${label.split(":")[0].trim()}: ${answer}` : `${label}: ${answer}`;

  const writeDb = BYPASS_AUTH ? db : createServiceClient();
  const { error: updErr } = await writeDb
    .from("fact_items")
    .update({
      description,
      status: "confirmed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", factId);

  if (updErr) {
    console.error("[answer-gap] update failed:", updErr.message);
    return NextResponse.json({ error: "Could not save your answer" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, description });
}
