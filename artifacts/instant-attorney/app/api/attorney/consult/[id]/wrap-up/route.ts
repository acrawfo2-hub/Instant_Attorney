import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";
import {
  applyWrapUpToLivingFile,
  emptyWrapUp,
  normalizeWrapUp,
  validateWrapUpForSubmit,
} from "@/lib/consult-wrap-up";
import { notifyClientConsultClosingReport } from "@/lib/notify";
import type { ConsultRequest, Profile } from "@/lib/types";

async function loadConsult(db: SupabaseClient, id: string): Promise<ConsultRequest | null> {
  const { data } = await db.from("consult_requests").select("*").eq("id", id).single();
  return (data as ConsultRequest | null) ?? null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const consult = await loadConsult(viewer.db, id);
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
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { db } = viewer;

  const consult = await loadConsult(db, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  // Gate on whether the CLOSEOUT REPORT was already sent, not on the consult's
  // overall status — "End session" also sets status to "completed" (it's a
  // separate lifecycle signal, see the session route), and that must not lock
  // the attorney out of writing the report afterward.
  if (consult.wrap_up_submitted_at) {
    return NextResponse.json({ error: "Closeout report already sent" }, { status: 400 });
  }

  const wrapUp = body.wrapUp ? normalizeWrapUp(body.wrapUp) : undefined;
  const attorneyNotes = typeof body.attorneyNotes === "string" ? body.attorneyNotes : undefined;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (wrapUp) update.wrap_up_draft = wrapUp;
  if (attorneyNotes !== undefined) update.attorney_notes = attorneyNotes;

  const { data: updated, error } = await db
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
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const { db } = viewer;

  const consult = await loadConsult(db, id);
  if (!consult) return NextResponse.json({ error: "Consult not found" }, { status: 404 });
  if (consult.wrap_up_submitted_at) {
    return NextResponse.json({ error: "Closeout report already sent" }, { status: 400 });
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
    await db.from("consult_requests").update({
      attorney_notes: body.attorneyNotes,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
  }

  try {
    const updated = await applyWrapUpToLivingFile(db, consult, wrapUp);

    try {
      const { data: clientProfile } = await db
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
