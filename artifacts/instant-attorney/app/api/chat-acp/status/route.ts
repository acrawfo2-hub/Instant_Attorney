import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAcpJob } from "@/lib/acp-jobs";
import { BYPASS_USER_ID } from "@/lib/types";
import { persistDrafts } from "@/lib/draft-persistence";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function context() {
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();
  if (BYPASS_AUTH) return { db, userId: BYPASS_USER_ID };
  const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
  return error || !user ? null : { db, userId: user.id };
}

// Case discovery is intentionally durable: all unfinished turns plus terminal
// turns beyond this client's cursor are returned in sequence order.
export async function GET(req: NextRequest) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!caseFileId && !jobId) return NextResponse.json({ error: "caseFileId or jobId is required" }, { status: 400 });

  let query = ctx.db.from("chat_acp_jobs").select("*").eq("user_id", ctx.userId);
  query = caseFileId ? query.eq("case_file_id", caseFileId) : query.eq("id", jobId!);
  const { data: rows, error } = await query.order("sequence", { ascending: true });
  if (error) return NextResponse.json({ error: "Could not load chat jobs." }, { status: 500 });
  const actualCaseId = caseFileId ?? rows?.[0]?.case_file_id;
  let cursor = 0;
  if (actualCaseId) {
    const { data: ack } = await ctx.db.from("chat_acp_acknowledgments")
      .select("acknowledged_sequence").eq("case_file_id", actualCaseId)
      .eq("user_id", ctx.userId).maybeSingle();
    cursor = ack?.acknowledged_sequence ?? 0;
  }

  // Shape of the chat_acp_jobs columns this route selects.
  type JobRow = {
    id: string; case_file_id: string; sequence: number; state: string;
    error: string | null; final_text: string | null; truncated: boolean | null;
    assistant_message_id: string | null; started_at: string; finished_at: string | null;
  };
  const jobRows = (rows ?? []) as JobRow[];
  const orphanRows = jobRows.filter((row) =>
    (row.state === "running" || row.state === "queued") && !getAcpJob(row.id));
  const linkedIds = new Set(jobRows.map((row) => row.assistant_message_id).filter(Boolean));
  let recoveredMessages: Array<{ id: string; content: string }> = [];
  if (actualCaseId && orphanRows.length) {
    const { data } = await ctx.db.from("intake_messages").select("id, content, created_at")
      .eq("case_file_id", actualCaseId).eq("user_id", ctx.userId).eq("role", "assistant")
      .gte("created_at", orphanRows[0].started_at).order("created_at", { ascending: true });
    recoveredMessages = ((data ?? []) as Array<{ id: string; content: string }>)
      .filter((message) => !linkedIds.has(message.id));
  }

  const jobs = [];
  for (const row of jobRows) {
    let state = row.state as string;
    let jobError = row.error as string | null;
    // A durable nonterminal row without its live executor means the process
    // restarted. The assistant link proves persistence completed; otherwise
    // fail explicitly instead of claiming mysteriously that nothing is running.
    if ((state === "running" || state === "queued") && !getAcpJob(row.id)) {
      const recovered = row.assistant_message_id ? null : recoveredMessages.shift();
      state = row.assistant_message_id || recovered ? "completed" : "failed";
      jobError = state === "completed" ? null : "Generation was interrupted by a server restart. Please send this turn again.";
      if (recovered) {
        row.assistant_message_id = recovered.id;
        row.final_text = recovered.content;
      }
      await ctx.db.from("chat_acp_jobs").update({
        state, error: jobError, final_text: row.final_text,
        assistant_message_id: row.assistant_message_id,
        finished_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", row.id).eq("user_id", ctx.userId);
    }
    const unfinished = state === "running" || state === "queued";
    if (!unfinished && row.sequence <= cursor) continue;
    jobs.push({
      jobId: row.id, caseFileId: row.case_file_id, sequence: row.sequence, state,
      running: unfinished, done: !unfinished, startedAt: Date.parse(row.started_at),
      finishedAt: row.finished_at ? Date.parse(row.finished_at) : null,
      finalText: row.final_text, truncated: row.truncated, error: jobError,
      assistantMessageId: row.assistant_message_id,
      // #108's per-job draft-persistence report. It lives on the in-memory job,
      // so a job recovered after a restart reports null rather than pretending
      // its drafts were saved.
      draftPersistence: getAcpJob(row.id)?.draftPersistence ?? null,
    });
  }
  return NextResponse.json({ jobs, acknowledgedSequence: cursor });
}

// One POST serving two payloads, because a route file may export it only once.
// { caseFileId, sequence } acknowledges consumed jobs (#107's cursor);
// { jobId } retries drafts a finished job failed to persist (#108).
export async function POST(req: NextRequest) {
  const raw = await req.json().catch(() => ({})) as { caseFileId?: string; sequence?: number; jobId?: string };
  if (raw.jobId) return retryFailedDrafts(raw.jobId);

  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = raw;
  if (!body.caseFileId || !Number.isSafeInteger(body.sequence) || body.sequence! < 0) {
    return NextResponse.json({ error: "Valid caseFileId and sequence are required." }, { status: 400 });
  }
  const { data: current } = await ctx.db.from("chat_acp_acknowledgments")
    .select("acknowledged_sequence").eq("case_file_id", body.caseFileId)
    .eq("user_id", ctx.userId).maybeSingle();
  const sequence = Math.max(current?.acknowledged_sequence ?? 0, body.sequence!);
  const { error } = await ctx.db.from("chat_acp_acknowledgments").upsert({
    case_file_id: body.caseFileId, user_id: ctx.userId,
    acknowledged_sequence: sequence, updated_at: new Date().toISOString(),
  }, { onConflict: "case_file_id,user_id" });
  return error ? NextResponse.json({ error: "Could not acknowledge replies." }, { status: 500 }) : NextResponse.json({ acknowledgedSequence: sequence });
}

// Retry only the generated content retained on a failed job; the model is not
// called again, so users cannot lose or accidentally change the document.
async function retryFailedDrafts(jobId: string) {
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();
  let userId: string;
  if (BYPASS_AUTH) userId = BYPASS_USER_ID;
  else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }
  const job = getAcpJob(jobId);
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
