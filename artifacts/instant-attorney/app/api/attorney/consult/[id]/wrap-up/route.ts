import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import {
  applyWrapUpToLivingFile,
  emptyWrapUp,
  normalizeWrapUp,
  validateWrapUpForSubmit,
} from "@/lib/consult-wrap-up";
import { notifyClientConsultClosingReport } from "@/lib/notify";
import { BYPASS_USER_ID } from "@/lib/types";
import type { ConsultRequest, Profile } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function loadConsult(
  db: ReturnType<typeof createServiceClient>,
  id: string,
): Promise<ConsultRequest | null> {
  const { data } = await db.from("consult_requests").select("*").eq("id", id).single();
  return (data as ConsultRequest | null) ?? null;
}

export async function GET(
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
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
    const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
    if (!profile?.is_attorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const consult = await loadConsult(createServiceClient(), id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });

  const draft = normalizeWrapUp(consult.wrap_up_draft ?? consult.post_consult_plan ?? emptyWrapUp());

  return NextResponse.json({
    consultId: consult.id,
    status: consult.status,
    attorneyNotes: consult.attorney_notes ?? "",
    wrapUp: draft,
    submittedAt: consult.wrap_up_submitted_at,
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
    const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
    if (!profile?.is_attorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceDb = createServiceClient();
  const consult = await loadConsult(serviceDb, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (consult.status === "completed") {
    return NextResponse.json({ error: "Consult already completed" }, { status: 400 });
  }

  const wrapUp = body.wrapUp ? normalizeWrapUp(body.wrapUp) : undefined;
  const attorneyNotes = typeof body.attorneyNotes === "string" ? body.attorneyNotes : undefined;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (wrapUp) update.wrap_up_draft = wrapUp;
  if (attorneyNotes !== undefined) update.attorney_notes = attorneyNotes;

  const { data: updated, error } = await serviceDb
    .from("consult_requests")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: error?.message ?? "Save failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, consult: updated });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (!BYPASS_AUTH) {
    const db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", user.id).single();
    if (!profile?.is_attorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceDb = createServiceClient();
  const consult = await loadConsult(serviceDb, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (consult.status === "completed") {
    return NextResponse.json({ error: "Consult already completed" }, { status: 400 });
  }
  if (!consult.case_file_id) {
    return NextResponse.json({ error: "Link a case file before submitting wrap-up" }, { status: 400 });
  }

  const wrapUp = normalizeWrapUp(body.wrapUp ?? emptyWrapUp());
  const validation = validateWrapUpForSubmit(wrapUp);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.errors.join(" ") }, { status: 400 });
  }

  if (typeof body.attorneyNotes === "string") {
    await serviceDb.from("consult_requests").update({
      attorney_notes: body.attorneyNotes,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  }

  try {
    const updated = await applyWrapUpToLivingFile(serviceDb, consult, wrapUp);

    try {
      const { data: clientProfile } = await serviceDb
        .from("profiles")
        .select("*")
        .eq("id", updated.user_id)
        .single();
      if (clientProfile) {
        await notifyClientConsultClosingReport(updated, clientProfile as Profile, wrapUp);
      }
    } catch (e) {
      console.error("[consult/wrap-up] notify error:", e);
    }

    return NextResponse.json({ ok: true, consult: updated });
  } catch (err) {
    console.error("[consult/wrap-up] submit error:", err);
    return NextResponse.json({ error: "Wrap-up submission failed" }, { status: 500 });
  }
}
