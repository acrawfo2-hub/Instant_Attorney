import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";

// Correcting a typo in a note taken live — appending a follow-up note is the
// norm; this exists for the rare "I need to fix what I just typed" case.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; noteId: string }> }
) {
  const { id, noteId } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const text = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Note body is required" }, { status: 400 });

  const { data: note, error } = await viewer.db
    .from("consult_notes")
    .update({ body: text, updated_at: new Date().toISOString() })
    .eq("id", noteId)
    .eq("consult_request_id", id)
    .select("*")
    .single();

  if (error || !note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ note });
}
