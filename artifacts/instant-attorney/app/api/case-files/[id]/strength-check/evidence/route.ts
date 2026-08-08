import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

// Convert one Strength Check evidence-gap item into a requested attachment so it
// flows into "Where things stand" and the documents checklist (same shape as the
// orchestrator's request_document tool).

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: caseFileId } = await params;
  const body = (await req.json().catch(() => null)) as { item?: string; why?: string } | null;
  const description = typeof body?.item === "string" ? body.item.trim() : "";
  if (!description) {
    return NextResponse.json({ error: "item is required" }, { status: 400 });
  }

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  let isAttorney = false;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
    const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).maybeSingle();
    isAttorney = Boolean(profile?.is_attorney);
  }

  const writeDb = BYPASS_AUTH || isAttorney ? createServiceClient() : db;
  const { data: cf } = await writeDb
    .from("case_files")
    .select("id, user_id")
    .eq("id", caseFileId)
    .maybeSingle();
  if (!cf) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!BYPASS_AUTH && !isAttorney && cf.user_id !== userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Dedupe against the existing checklist (case-insensitive), like request_document.
  const { data: existing } = await writeDb
    .from("requested_attachments")
    .select("id, description")
    .eq("case_file_id", caseFileId);
  const match = ((existing ?? []) as { id: string; description: string }[]).find(
    (r) => r.description.toLowerCase() === description.toLowerCase(),
  );
  if (match) {
    return NextResponse.json({ ok: true, deduped: true, id: match.id });
  }

  const { data: inserted, error: insErr } = await writeDb
    .from("requested_attachments")
    .insert({
      case_file_id: caseFileId,
      user_id: cf.user_id,
      description,
      reason: typeof body?.why === "string" && body.why.trim() ? body.why.trim() : null,
      status: "requested",
      source: "ai",
    })
    .select("id")
    .single();
  if (insErr) {
    console.error("[strength-check/evidence] insert failed:", insErr.message);
    return NextResponse.json({ error: "Could not add it to your checklist" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: inserted?.id });
}
