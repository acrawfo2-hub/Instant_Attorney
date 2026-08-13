import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { draftInstrument, type DraftingResult } from "./document-drafting.ts";
import { coerceInstrumentType } from "./types.ts";
import type { CaseFile, FactItem, Attachment, RequestedAttachment } from "./types.ts";

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

/**
 * Turn one job into document text, through the same pipeline every other
 * uses — `lib/document-drafting.ts`.
 *
 * This used to be a direct Anthropic call with a one-sentence system prompt and
 * none of the Generation stages: no instrument identity, no pinned authority, no
 * generation spec, no risk gate, no validator, and no marker check, so a
 * truncated response was written to the draft as if it were finished. It also
 * selected `category, fact_text, source_quote` from `fact_items`, none of which
 * exist, so every document it produced was drafted with no facts at all.
 *
 * A failure here throws rather than saving something. The caller marks the job
 * `failed` with the reason, the shell stays visible, and the client gets a retry
 * — which is the point of the durable job. Writing partial or ungated text into
 * a draft the client can submit for attorney review is the outcome worth
 * avoiding.
 *
 * An unestablished governing forum is NOT such a failure. The draft comes back
 * complete, with the forum written as a BLOCKING placeholder everywhere it would
 * have appeared, and it is saved like any other. The client sees the document
 * and the gap in it, which is more use than an error.
 */
async function generateJobText(db: SupabaseClient, job: Job): Promise<string> {
  const [{ data: caseFile }, { data: facts }, { data: attachments }, { data: requested }] = await Promise.all([
    db.from("case_files").select("*").eq("id", job.case_file_id).single(),
    db.from("fact_items").select("*").eq("case_file_id", job.case_file_id).order("created_at"),
    db.from("attachments").select("*").eq("case_file_id", job.case_file_id).eq("status", "ready"),
    db.from("requested_attachments").select("*").eq("case_file_id", job.case_file_id),
  ]);

  // The plan's documentType is a free-form slug the model chose, so it may not
  // name a drafting engine. `general_document` is the honest fallback — it has a
  // real spec and profile, where an invented type would have neither.
  const instrumentType = coerceInstrumentType(job.document_type) ?? "general_document";

  const client = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
  const result: DraftingResult = await draftInstrument(client, {
    instrumentType,
    instrumentLabel: job.title,
    caseFile: (caseFile ?? null) as CaseFile | null,
    facts: (facts ?? []) as FactItem[],
    attachments: (attachments ?? []) as Attachment[],
    requestedAttachments: (requested ?? []) as RequestedAttachment[],
    messages: [{ role: "user", content: `Draft the ${job.title}.` }],
  });

  if (result.kind === "error") {
    throw new Error(result.message);
  }
  if (!result.draftText) {
    // A markerless response is recovery material, not a draft.
    throw new Error(`The draft did not arrive complete (${result.incompleteReason}). Retry to regenerate it.`);
  }
  if (result.truncated) {
    // extractDraftText salvages a draft block that opened but never closed, so
    // a truncated run can still yield text. A markerless response is recovery
    // flags `truncated` in content_json, because a person is looking at it and
    // can retry. Nothing here is watching: client_workspace_drafts has no
    // truncation flag, so saving it would put a half-written document in the
    // panel looking finished — and the client can promote that straight into the
    // attorney review queue. Failing keeps the visible shell, records why, and
    // leaves the job retryable, which is the same promise by the other route.
    throw new Error("The draft was cut off before it finished. Retry to regenerate it.");
  }

  return result.draftText;
}

export async function processQueuedDocumentJobs(db: SupabaseClient, limit = 3): Promise<number> {
  const bounded = Math.max(1, Math.min(3, Math.floor(limit)));
  const { data, error } = await db.from("document_generation_jobs").select("id").eq("status", "queued")
    .order("priority", { ascending: false }).order("created_at").limit(bounded);
  if (error) throw error;
  const results = await Promise.all((data ?? []).map((row) => runDocumentGenerationJob(db, row.id)));
  return results.filter(Boolean).length;
}
