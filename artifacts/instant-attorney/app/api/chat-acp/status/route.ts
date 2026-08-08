import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAcpJob, getActiveAcpJob, isAcpJobRunning } from "@/lib/acp-jobs";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// GET /api/chat-acp/status?jobId=… | ?caseFileId=…
//
// Reports the live state of a background chat turn so the client can unlock
// the composer while a long draft generates, survive a reload, and pick up the
// finished assistant text after navigating away and back. Jobs live in the
// in-process registry (single-instance server); after a restart this simply
// reports not-running and the client falls back to persisted drafts/messages.
export async function GET(req: NextRequest) {
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const jobId = req.nextUrl.searchParams.get("jobId");
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");

  const job = jobId
    ? getAcpJob(jobId)
    : caseFileId
      // The actively generating turn (oldest unfinished in the chain), not a
      // queued turn that hasn't started — reload recovery tracks the real draft.
      ? getActiveAcpJob(caseFileId)
      : null;

  if (!job || job.userId !== userId) {
    return NextResponse.json({ running: false, done: false });
  }

  if (isAcpJobRunning(job)) {
    return NextResponse.json({
      running: true,
      done: false,
      jobId: job.id,
      caseFileId: job.caseFileId,
      startedAt: job.startedAt,
    });
  }

  return NextResponse.json({
    running: false,
    done: job.done,
    jobId: job.id,
    caseFileId: job.caseFileId,
    startedAt: job.startedAt,
    finalText: job.finalText,
    truncated: job.truncated,
    error: job.error,
  });
}
