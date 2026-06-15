import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DRAFTER_SYSTEM_PROMPT, WIZARD_FIELD_HINTS, buildFileContext } from "./prompts";
import { isValidWizardType } from "./document-utils";
import { extractDraftText } from "./file-parser";
import { recordAiFromMessage } from "./usage-tracker";
import { logTruncation } from "./truncation-logger";
import { WIZARD_LABELS } from "./types";
import { maxOutputTokensFor, limitSignalMetadata } from "./token-limits";
import type { CaseFile, FactItem, WizardType, Attachment, RequestedAttachment } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export async function triggerPreWarm(
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  wizardType: WizardType
): Promise<void> {
  if (!isValidWizardType(wizardType)) {
    console.warn("[pre-warm] Skipping invalid wizard type:", wizardType);
    return;
  }

  const label = WIZARD_LABELS[wizardType];

  // Check if a pre-warmed or in-progress draft already exists
  const { data: existing } = await db
    .from("documents")
    .select("id")
    .eq("case_file_id", caseFileId)
    .eq("doc_type", wizardType)
    .eq("status", "pre_warmed")
    .maybeSingle();

  if (existing) return;

  // Load file state
  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
      db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
    ]);

  if (!caseFileRow) return;

  const caseFile = caseFileRow as CaseFile;
  const facts = (factRows ?? []) as FactItem[];
  const attachments = (attachmentRows ?? []) as Attachment[];
  const requestedAttachments = (requestedRows ?? []) as RequestedAttachment[];
  const fileContext = buildFileContext(caseFile, facts, attachments, requestedAttachments);
  const fieldHints = WIZARD_FIELD_HINTS[wizardType];
  const initMessage = `Please draft a ${label} based on my Living File. Document type: ${wizardType}`;

  // Create placeholder document row first so duplicate pre-warm calls are idempotent
  const { data: inserted } = await db
    .from("documents")
    .insert({
      case_file_id: caseFileId,
      user_id: userId,
      doc_type: wizardType,
      title: `${label} — ${new Date().toLocaleDateString()}`,
      status: "pre_warmed",
      draft_text: null,
      content_json: {},
    })
    .select("id")
    .single();

  if (!inserted) {
    console.error("[pre-warm] Failed to insert placeholder document for", wizardType);
    return;
  }

  // Generate the draft synchronously and persist it directly. We deliberately do
  // NOT use the Message Batches API here: batch results must be fetched by a
  // separate poll, and the only poller was a Vercel cron (vercel.json) that never
  // runs in this (Replit) environment — so pre-warmed rows were created but their
  // draft_text was never written back, making pre-warm look like it "didn't save".
  // This mirrors app/api/wizard/route.ts: stream server-side, then assemble the
  // full message. Streaming (not a plain create) is required because our large
  // max_tokens ceiling otherwise trips the SDK's "Streaming is required…" guard.
  // triggerPreWarm is always called fire-and-forget on the long-lived Next
  // server, so awaiting the full generation here runs entirely in the background
  // and never blocks (or can be interrupted by) the caller.
  let message: Anthropic.Message;
  try {
    const stream = anthropic.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
      system: [
        {
          type: "text" as const,
          text: DRAFTER_SYSTEM_PROMPT,
        },
        {
          type: "text" as const,
          text: `Document being drafted: ${label}\n\n${fieldHints}`,
          cache_control: { type: "ephemeral" as const },
        },
        {
          type: "text" as const,
          text: fileContext,
        },
      ],
      messages: [{ role: "user" as const, content: initMessage }],
    });
    message = await stream.finalMessage();
  } catch (err) {
    console.error("[pre-warm] Anthropic streaming error:", err);
    // Remove placeholder so a future call can retry
    await db.from("documents").delete().eq("id", inserted.id);
    return;
  }

  const fullResponse = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const truncated = message.stop_reason === "max_tokens";
  if (truncated) {
    logTruncation({
      endpoint: "pre-warm",
      feature: "pre_warm",
      documentId: inserted.id,
      caseFileId,
      userId,
      outputTokens: message.usage.output_tokens,
    });
  }

  // Record usage at full price (this is a normal synchronous call, not the
  // discounted batch API). Fire-and-forget — never block persistence on it.
  recordAiFromMessage(db, message, {
    userId,
    actorId: null,
    caseFileId,
    feature: "pre_warm",
    metadata: {
      document_id: inserted.id,
      wizard_type: wizardType,
      ...limitSignalMetadata({
        model: message.model,
        outputTokens: message.usage.output_tokens,
        priorLimit: 8000,
        stopReason: message.stop_reason,
      }),
    },
  }).catch((e) => console.error("[pre-warm] usage record error:", e));

  // Persist the draft. Prefer the marked ---DRAFT READY--- block; if it's missing
  // only because the model truncated before emitting markers, keep the partial
  // output rather than losing the work. Otherwise treat it as a failed warm and
  // remove the placeholder so a later call can retry cleanly.
  const draftText = extractDraftText(fullResponse) ?? (truncated ? fullResponse.trim() || null : null);

  if (!draftText) {
    console.error(`[pre-warm] No usable draft for ${label} (doc: ${inserted.id}) — removing placeholder`);
    await db.from("documents").delete().eq("id", inserted.id);
    return;
  }

  const { error: updateErr } = await db
    .from("documents")
    .update({
      draft_text: draftText,
      content_json: { init_response: fullResponse, ...(truncated ? { truncated: true } : {}) },
      updated_at: new Date().toISOString(),
    })
    .eq("id", inserted.id);

  if (updateErr) {
    console.error("[pre-warm] draft update failed:", updateErr.message);
    await db.from("documents").delete().eq("id", inserted.id);
    return;
  }

  console.log(`[pre-warm] Draft saved for ${label} (doc: ${inserted.id})${truncated ? " (truncated)" : ""}`);
}
