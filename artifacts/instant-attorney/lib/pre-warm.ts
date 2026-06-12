import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DRAFTER_SYSTEM_PROMPT, WIZARD_FIELD_HINTS, buildFileContext } from "./prompts";
import { extractDraftText } from "./file-parser";
import { isValidWizardType } from "./document-utils";
import { recordAiFromStream } from "./usage-tracker";
import { WIZARD_LABELS } from "./types";
import type { CaseFile, FactItem, WizardType, Attachment, RequestedAttachment } from "./types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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

  // Check if a pre-warmed draft already exists for this case file + doc type
  const { data: existing } = await db
    .from("documents")
    .select("id")
    .eq("case_file_id", caseFileId)
    .eq("doc_type", wizardType)
    .eq("status", "pre_warmed")
    .maybeSingle();

  if (existing) return; // Already pre-warmed

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
  const systemPrompt = `${fileContext}\n\nDocument being drafted: ${label}\n${fieldHints}\n\n${DRAFTER_SYSTEM_PROMPT}`;

  const initMessage = `Please draft a ${label} based on my Living File. Document type: ${wizardType}`;

  let fullResponse = "";
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    system: systemPrompt,
    messages: [{ role: "user", content: initMessage }],
  });

  try {
    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        fullResponse += event.delta.text;
      }
    }
  } catch (err) {
    console.error("[pre-warm] Anthropic error:", err);
    return;
  }

  await recordAiFromStream(db, stream, {
    userId,
    actorId: userId,
    caseFileId,
    feature: "pre_warm",
    metadata: { wizard_type: wizardType },
  });

  const draftText = extractDraftText(fullResponse);
  if (!draftText) {
    console.error("[pre-warm] No draft text extracted for", wizardType);
    return;
  }

  await db.from("documents").insert({
    case_file_id: caseFileId,
    user_id: userId,
    doc_type: wizardType,
    title: `${label} — ${new Date().toLocaleDateString()}`,
    status: "pre_warmed",
    content_json: { init_response: fullResponse },
    draft_text: draftText,
  });

  console.log(`[pre-warm] ${label} pre-warmed for case ${caseFileId}`);
}
