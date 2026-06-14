import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DRAFTER_SYSTEM_PROMPT, WIZARD_FIELD_HINTS, buildFileContext } from "./prompts";
import { isValidWizardType } from "./document-utils";
import { WIZARD_LABELS } from "./types";
import type { CaseFile, FactItem, WizardType, Attachment, RequestedAttachment } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney });

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

  try {
    const batch = await anthropic.messages.batches.create({
      requests: [
        {
          custom_id: inserted.id,
          params: {
            model: "claude-sonnet-4-6",
            max_tokens: 8000,
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
          },
        },
      ],
    });

    // Store batch ID so the poll endpoint can retrieve the result
    await db.from("documents").update({
      content_json: { batch_job_id: batch.id },
      updated_at: new Date().toISOString(),
    }).eq("id", inserted.id);

    console.log(`[pre-warm] Batch submitted for ${label} (doc: ${inserted.id}, batch: ${batch.id})`);
  } catch (err) {
    console.error("[pre-warm] Batch submission error:", err);
    // Remove placeholder so a future call can retry
    await db.from("documents").delete().eq("id", inserted.id);
  }
}
