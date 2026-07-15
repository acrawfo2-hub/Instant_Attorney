import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";

// Receives the result of client-side (on-device) transcription once it
// finishes running in the attorney's browser. There is no server-side STT —
// this endpoint only persists whatever the browser already computed.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; recordingId: string }> }
) {
  const { id, recordingId } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null);

  let update: Record<string, unknown>;
  if (typeof payload?.text === "string") {
    update = {
      transcript_status: "ready",
      transcript_text: payload.text,
      transcript_error: null,
      transcribed_at: new Date().toISOString(),
    };
  } else if (typeof payload?.error === "string") {
    update = { transcript_status: "failed", transcript_error: payload.error };
  } else if (payload?.status === "processing") {
    update = { transcript_status: "processing" };
  } else {
    return NextResponse.json({ error: "text, error, or status=processing is required" }, { status: 400 });
  }

  const { data: recording, error } = await viewer.db
    .from("consult_recordings")
    .update(update)
    .eq("id", recordingId)
    .eq("consult_request_id", id)
    .select("*")
    .single();

  if (error || !recording) return NextResponse.json({ error: "Recording not found" }, { status: 404 });
  return NextResponse.json({ recording });
}
