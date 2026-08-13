import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildConsultCloseoutPrompt } from "./prompts.ts";
import { normalizeWrapUp, emptyWrapUp } from "./consult-wrap-up.ts";
import { recordAiFromMessage } from "./usage-tracker.ts";
import { maxOutputTokensFor, limitSignalMetadata } from "./token-limits.ts";
import type { CaseFile, ConsultNote, ConsultRecording, ConsultRequest, ConsultWrapUp, FactItem } from "./types.ts";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

// Claude is asked for a single JSON object (see buildConsultCloseoutPrompt).
// A code fence or stray prose around it is tolerated; anything else falls
// back to an empty draft with the raw text preserved in consultSummary so
// nothing the model wrote is lost — the attorney edits from there either way.
function parseDraft(raw: string): ConsultWrapUp {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  try {
    return normalizeWrapUp(JSON.parse(candidate.trim()));
  } catch {
    return { ...emptyWrapUp(), consultSummary: raw.trim() };
  }
}

/** Draft the closeout report from notes and transcript. Does not persist. */
export async function buildConsultCloseoutDraft(
  db: SupabaseClient,
  consultId: string,
  actorId: string,
): Promise<ConsultWrapUp> {
  const { data: consultRow } = await db.from("consult_requests").select("*").eq("id", consultId).single();
  if (!consultRow) throw new Error("Consult request not found");
  const consult = consultRow as ConsultRequest;
  if (!consult.case_file_id) throw new Error("Consult has no linked case file");

  const [{ data: caseFileRow }, { data: factRows }, { data: noteRows }, { data: recordingRows }] = await Promise.all([
    db.from("case_files").select("*").eq("id", consult.case_file_id).single(),
    db.from("fact_items").select("*").eq("case_file_id", consult.case_file_id),
    db.from("consult_notes").select("*").eq("consult_request_id", consultId).order("created_at", { ascending: true }),
    db
      .from("consult_recordings")
      .select("*")
      .eq("consult_request_id", consultId)
      .eq("transcript_status", "ready")
      .order("recorded_at", { ascending: true }),
  ]);

  if (!caseFileRow) throw new Error("Case file not found");

  const notes = ((noteRows ?? []) as ConsultNote[]).map((n) => n.body);
  const transcript = ((recordingRows ?? []) as ConsultRecording[])
    .map((r) => r.transcript_text)
    .filter((t): t is string => !!t)
    .join("\n\n") || null;

  const prompt = buildConsultCloseoutPrompt(caseFileRow as CaseFile, (factRows ?? []) as FactItem[], notes, transcript);

  const response = await anthropic.messages
    .stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
      messages: [{ role: "user", content: prompt }],
    })
    .finalMessage();

  const raw = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  await recordAiFromMessage(db, response, {
    userId: consult.user_id,
    actorId,
    caseFileId: consult.case_file_id,
    feature: "attorney_consult_closeout",
    metadata: {
      ...limitSignalMetadata({
        model: response.model,
        outputTokens: response.usage.output_tokens,
        priorLimit: 4000,
        stopReason: response.stop_reason,
      }),
    },
  });

  return parseDraft(raw);
}

/** Generate an AI closeout draft and persist it as wrap_up_draft. */
export async function generateConsultCloseoutDraft(
  db: SupabaseClient,
  consultId: string,
  actorId: string,
): Promise<ConsultWrapUp> {
  const draft = await buildConsultCloseoutDraft(db, consultId, actorId);
  await db
    .from("consult_requests")
    .update({ wrap_up_draft: draft, updated_at: new Date().toISOString() })
    .eq("id", consultId);
  return draft;
}
