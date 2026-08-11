import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getAcpJob } from "@/lib/acp-jobs";
import { BYPASS_USER_ID } from "@/lib/types";

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

  const orphanRows = (rows ?? []).filter((row: any) =>
    (row.state === "running" || row.state === "queued") && !getAcpJob(row.id));
  const linkedIds = new Set((rows ?? []).map((row: any) => row.assistant_message_id).filter(Boolean));
  let recoveredMessages: Array<{ id: string; content: string }> = [];
  if (actualCaseId && orphanRows.length) {
    const { data } = await ctx.db.from("intake_messages").select("id, content, created_at")
      .eq("case_file_id", actualCaseId).eq("user_id", ctx.userId).eq("role", "assistant")
      .gte("created_at", orphanRows[0].started_at).order("created_at", { ascending: true });
    recoveredMessages = (data ?? []).filter((message: any) => !linkedIds.has(message.id));
  }

  const jobs = [];
  for (const row of rows ?? []) {
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
    });
  }
  return NextResponse.json({ jobs, acknowledgedSequence: cursor });
}

export async function POST(req: NextRequest) {
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => ({})) as { caseFileId?: string; sequence?: number };
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
