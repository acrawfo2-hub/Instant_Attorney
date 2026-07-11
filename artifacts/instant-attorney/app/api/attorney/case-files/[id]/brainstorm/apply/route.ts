import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";
import { parseAndUpdateFile } from "@/lib/file-parser";
import type { CaseBrainstormMessage } from "@/lib/types";

// Commits a proposed ---LIVING FILE---/---LEGAL STRATEGY--- block from a
// brainstorm message to the actual case file — the attorney's explicit
// approval step, since (unlike the client intake chat) nothing here writes
// automatically. Idempotent: re-applying an already-applied message is a no-op.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const messageId = typeof payload?.messageId === "string" ? payload.messageId : null;
  if (!messageId) return NextResponse.json({ error: "messageId is required" }, { status: 400 });

  const { db } = viewer;

  const [{ data: messageRow }, { data: caseFileRow }] = await Promise.all([
    db
      .from("case_brainstorm_messages")
      .select("*")
      .eq("id", messageId)
      .eq("case_file_id", id)
      .eq("role", "assistant")
      .single(),
    db.from("case_files").select("user_id").eq("id", id).single(),
  ]);

  if (!messageRow) return NextResponse.json({ error: "Message not found" }, { status: 404 });
  if (!caseFileRow) return NextResponse.json({ error: "Case file not found" }, { status: 404 });

  const message = messageRow as CaseBrainstormMessage;
  if (message.applied_at) {
    return NextResponse.json({ ok: true, message });
  }

  try {
    // fact_items/requested_attachments rows are attributed to the case's
    // client (caseFileRow.user_id), not the attorney applying the update.
    await parseAndUpdateFile(db, id, caseFileRow.user_id, message.content);
  } catch (err) {
    console.error("[brainstorm/apply] parse error:", err);
    return NextResponse.json({ error: "Failed to apply update" }, { status: 500 });
  }

  const { data: updated, error } = await db
    .from("case_brainstorm_messages")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", messageId)
    .select("*")
    .single();

  if (error || !updated) {
    return NextResponse.json({ error: "Update applied, but failed to mark the message as applied" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: updated });
}
