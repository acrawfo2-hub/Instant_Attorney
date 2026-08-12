import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAcpJob, getActiveAcpJob, isAcpJobRunning } from "@/lib/acp-jobs";
import { BYPASS_USER_ID } from "@/lib/types";
import { persistDrafts } from "@/lib/draft-persistence";

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
    draftPersistence: job.draftPersistence,
  });
}

// Retry only the generated content retained on a failed job; the model is not
// called again, so users cannot lose or accidentally change the document.
export async function POST(req: NextRequest) {
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();
  let userId: string;
  if (BYPASS_AUTH) userId = BYPASS_USER_ID;
  else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }
  const { jobId } = await req.json() as { jobId?: string };
  const job = jobId ? getAcpJob(jobId) : null;
  if (!job || job.userId !== userId) return NextResponse.json({ error: "Recovery job not found" }, { status: 404 });

  const retry = await persistDrafts(job.draftPersistence.failed, {
    find: async (title) => {
      const { data, error } = await db.from("client_workspace_drafts").select("id")
        .eq("case_file_id", job.caseFileId).eq("user_id", userId).eq("title", title)
        .order("updated_at", { ascending: false }).limit(1).maybeSingle();
      return { id: data?.id ?? null, error };
    },
    update: async (id, draft) => {
      const { error } = await db.from("client_workspace_drafts").update({
        content: draft.content, source: "assistant", updated_at: new Date().toISOString(),
      }).eq("id", id);
      return { error };
    },
    insert: async (draft) => {
      const { data, error } = await db.from("client_workspace_drafts").insert({
        case_file_id: job.caseFileId, user_id: userId, title: draft.title,
        content: draft.content, source: "assistant",
      }).select("id").single();
      return { id: data?.id ?? null, error };
    },
  });
  job.draftPersistence = {
    persisted: [...job.draftPersistence.persisted, ...retry.persisted],
    failed: retry.failed,
  };
  job.error = retry.failed.length ? "One or more generated drafts still need to be saved." : null;
  return NextResponse.json({ draftPersistence: job.draftPersistence, error: job.error });
}
