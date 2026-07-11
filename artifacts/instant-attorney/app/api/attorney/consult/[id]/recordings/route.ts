import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";
import { storeConsultRecording } from "@/lib/consult-recording";

// Uploads a just-finished consult recording (raw audio bytes as the request
// body — the client posts the MediaRecorder Blob directly, no multipart
// needed). Transcription happens separately, client-side, after this
// succeeds — see [recordingId]/transcript/route.ts.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: consult } = await viewer.db.from("consult_requests").select("id").eq("id", id).single();
  if (!consult) return NextResponse.json({ error: "Consult request not found" }, { status: 404 });

  const contentType = req.headers.get("content-type") || "audio/webm";
  const durationHeader = req.headers.get("x-recording-duration");
  const durationSeconds = durationHeader ? Math.round(Number(durationHeader)) : null;

  const arrayBuf = await req.arrayBuffer();
  if (arrayBuf.byteLength === 0) {
    return NextResponse.json({ error: "Empty recording" }, { status: 400 });
  }

  try {
    const recording = await storeConsultRecording({
      serviceDb: viewer.db,
      consultRequestId: id,
      recordedBy: viewer.userId,
      buffer: Buffer.from(arrayBuf),
      contentType,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    });
    return NextResponse.json({ recording });
  } catch (err) {
    console.error("[consult-recording] upload failed:", err);
    return NextResponse.json({ error: "Failed to store recording" }, { status: 500 });
  }
}
