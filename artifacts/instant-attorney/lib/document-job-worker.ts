import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";

type Job = { id: string; case_file_id: string; user_id: string; workspace_draft_id: string | null; document_type: string; title: string; generation_attempt: number };

/** Claims and completes one durable job. Safe for independent worker processes. */
export async function runDocumentGenerationJob(db: SupabaseClient, jobId: string, generate = generateJobText): Promise<boolean> {
  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await db.from("document_generation_jobs")
    .update({ status: "drafting", started_at: now, updated_at: now })
    .eq("id", jobId).eq("status", "queued")
    .select("id,case_file_id,user_id,workspace_draft_id,document_type,title,generation_attempt").maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return false;
  const job = claimed as Job;
  try {
    // The shell is created as soon as work starts, before any model call.
    if (!job.workspace_draft_id) {
      const { data: shell, error } = await db.from("client_workspace_drafts").insert({
        case_file_id: job.case_file_id, user_id: job.user_id, title: job.title, content: "", source: "assistant",
      }).select("id").single();
      if (error) throw error;
      job.workspace_draft_id = shell.id;
      await db.from("document_generation_jobs").update({ workspace_draft_id: shell.id, updated_at: new Date().toISOString() }).eq("id", job.id);
    }
    const content = await generate(db, job);
    await db.from("document_generation_jobs").update({ status: "checking", updated_at: new Date().toISOString() }).eq("id", job.id);
    const finished = new Date().toISOString();
    await db.from("client_workspace_drafts").update({ content, updated_at: finished }).eq("id", job.workspace_draft_id);
    await db.from("document_generation_jobs").update({ status: "ready", generation_attempt: job.generation_attempt + 1, error: null, updated_at: finished, completed_at: finished }).eq("id", job.id);
    return true;
  } catch (error) {
    await db.from("document_generation_jobs").update({ status: "failed", generation_attempt: job.generation_attempt + 1, error: error instanceof Error ? error.message : String(error), updated_at: new Date().toISOString(), completed_at: new Date().toISOString() }).eq("id", job.id);
    return false;
  }
}

async function generateJobText(db: SupabaseClient, job: Job): Promise<string> {
  const [{ data: file }, { data: facts }] = await Promise.all([
    db.from("case_files").select("title,summary,jurisdiction").eq("id", job.case_file_id).single(),
    db.from("fact_items").select("category,fact_text,source_quote").eq("case_file_id", job.case_file_id).order("created_at"),
  ]);
  const client = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
  const message = await client.messages.create({
    model: "claude-sonnet-4-6", max_tokens: 8000,
    system: "Draft only the requested legal working document. Use [[missing fact]] placeholders rather than inventing facts. Return document text only.",
    messages: [{ role: "user", content: JSON.stringify({ documentType: job.document_type, title: job.title, caseFile: file, facts: facts ?? [] }) }],
  });
  return message.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}

export async function processQueuedDocumentJobs(db: SupabaseClient, limit = 3): Promise<number> {
  const bounded = Math.max(1, Math.min(3, Math.floor(limit)));
  const { data, error } = await db.from("document_generation_jobs").select("id").eq("status", "queued")
    .order("priority", { ascending: false }).order("created_at").limit(bounded);
  if (error) throw error;
  const results = await Promise.all((data ?? []).map((row) => runDocumentGenerationJob(db, row.id)));
  return results.filter(Boolean).length;
}
