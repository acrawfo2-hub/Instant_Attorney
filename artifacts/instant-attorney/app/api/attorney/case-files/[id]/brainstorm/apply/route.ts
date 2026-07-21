import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";
import { parseAndUpdateFile, hasApplicableUpdate } from "@/lib/file-parser";
import type { CaseBrainstormMessage } from "@/lib/types";

// Commits a proposed ---LIVING FILE---/---LEGAL STRATEGY--- block from a
// brainstorm message to the actual case file — the attorney's explicit
// approval step, since (unlike the client intake chat) nothing here writes
// automatically. Idempotent: re-applying an already-applied message is a no-op.
//
// The claim-then-apply-then-confirm ordering below matters: `applied_at` is
// claimed atomically (conditioned on it still being null) BEFORE
// parseAndUpdateFile runs, not after. That's what stops two overlapping
// requests for the SAME message (a double-click, a retried request) from
// both running parseAndUpdateFile and inserting duplicate fact_items /
// requested_attachments rows — only whichever request wins the conditional
// update proceeds to write; the loser is treated as an idempotent no-op.
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

  // Reject BEFORE claiming — the client's "should I show Apply" check and
  // this route's "will applying actually do anything" check must agree, or
  // the attorney can see a permanent false "Applied" with no DB write and no
  // way to retry (the client uses this same predicate to decide when to show
  // the button, but the server is what must actually enforce it).
  if (!hasApplicableUpdate(message.content)) {
    return NextResponse.json(
      { error: "No applicable Living File or strategy update found in this message" },
      { status: 400 }
    );
  }

  // Atomically claim this message: only succeeds if applied_at is still null,
  // so a concurrent duplicate request loses this race instead of also
  // running parseAndUpdateFile.
  const { data: claimed } = await db
    .from("case_brainstorm_messages")
    .update({ applied_at: new Date().toISOString() })
    .eq("id", messageId)
    .is("applied_at", null)
    .select("*")
    .single();

  if (!claimed) {
    // Lost the race — a concurrent request already claimed (or applied) it.
    const { data: current } = await db
      .from("case_brainstorm_messages")
      .select("*")
      .eq("id", messageId)
      .single();
    return NextResponse.json({ ok: true, message: current ?? message });
  }

  try {
    // fact_items/requested_attachments rows are attributed to the case's
    // client (caseFileRow.user_id), not the attorney applying the update.
    await parseAndUpdateFile(db, id, caseFileRow.user_id, claimed.content);
  } catch (err) {
    console.error("[brainstorm/apply] parse error:", err);
    // Release the claim so the attorney can retry.
    await db.from("case_brainstorm_messages").update({ applied_at: null }).eq("id", messageId);
    return NextResponse.json({ error: "Failed to apply update" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: claimed as CaseBrainstormMessage });
}
