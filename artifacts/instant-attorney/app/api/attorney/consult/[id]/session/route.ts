import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";
import type { ConsultRequest } from "@/lib/types";

// Attorney-only state transitions on a confirmed consult's live session:
// starting/ending it (timestamps shown on the session page) and logging
// one-time recording consent before the first recording is made.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { db } = viewer;
  const { action } = await req.json();
  if (action !== "start" && action !== "end" && action !== "consent") {
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }

  const { data: existing, error: fetchErr } = await db
    .from("consult_requests")
    .select("*")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Consult request not found" }, { status: 404 });
  }
  const consult = existing as ConsultRequest;

  let update: Record<string, unknown>;
  if (action === "start") {
    if (consult.status !== "confirmed") {
      return NextResponse.json({ error: "Consult is not confirmed" }, { status: 400 });
    }
    // Idempotent — starting an already-started session just returns it as-is.
    update = { session_started_at: consult.session_started_at ?? new Date().toISOString() };
  } else if (action === "consent") {
    // Idempotent — only stamps the first time; re-confirming doesn't move it.
    update = { recording_consent_at: consult.recording_consent_at ?? new Date().toISOString() };
  } else {
    if (!consult.session_started_at) {
      return NextResponse.json({ error: "Session has not been started" }, { status: 400 });
    }
    update = {
      session_ended_at: new Date().toISOString(),
      status: "completed",
      updated_at: new Date().toISOString(),
    };
  }

  const { data: updated, error: updateErr } = await db
    .from("consult_requests")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json(updated);
}
