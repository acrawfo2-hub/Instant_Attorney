import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; findingId: string }> }) {
  const { id, findingId } = await params;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();
  let actorId: string | null = null;
  if (!BYPASS_AUTH) {
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
    const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", user.id).maybeSingle();
    if (!profile?.is_attorney) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
    actorId = user.id;
  }
  const body = await req.json().catch(() => ({})) as { status?: string; resolutionNote?: string };
  if (!body.status || !["open", "resolved", "waived"].includes(body.status)) {
    return NextResponse.json({ error: "status must be open, resolved, or waived" }, { status: 400 });
  }
  if (body.status === "waived" && !body.resolutionNote?.trim()) {
    return NextResponse.json({ error: "An attorney waiver requires a reason" }, { status: 400 });
  }
  const now = new Date().toISOString();
  const { data, error } = await db.from("document_qa_findings").update({
    status: body.status,
    resolution_note: body.status === "open" ? null : body.resolutionNote?.trim() || "Attorney confirmed remediation",
    resolved_by: body.status === "open" ? null : actorId,
    resolved_at: body.status === "open" ? null : now,
    updated_at: now,
  }).eq("id", findingId).eq("document_id", id).select("*").maybeSingle();
  if (error || !data) return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  return NextResponse.json({ finding: data });
}
