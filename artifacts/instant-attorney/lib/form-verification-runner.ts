// ── Screenshot verification orchestration ────────────────────────────────────
//
// Calls Claude vision on the client's uploaded photos/screenshots of a
// hand-filled government form and writes the structured result back to
// form_verifications. The prompt-building and response-parsing this relies on
// are pure and unit-tested in lib/form-verification.ts; this file just wires
// them to the Anthropic SDK and the DB, mirroring lib/attachment-processor.ts.

import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GovernmentForm } from "./government-forms.ts";
import { buildVerificationPrompt, parseVerificationResponse } from "./form-verification.ts";
import { toAnthropicBlock } from "./attachment-processor.ts";
import { recordAiFromMessage } from "./usage-tracker.ts";
import { logTruncation } from "./truncation-logger.ts";
import { maxOutputTokensFor, limitSignalMetadata } from "./token-limits.ts";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export interface VerificationImage {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

/** Run after upload: read the client's photos/screenshots against the form's
 * expected answers and write the structured result back to form_verifications. */
export async function verifyFormScreenshots(
  db: SupabaseClient,
  params: {
    verificationId: string;
    form: GovernmentForm;
    answers: Record<string, unknown>;
    images: VerificationImage[];
    userId: string;
    caseFileId: string;
  }
): Promise<void> {
  const { verificationId, form, answers, images, userId, caseFileId } = params;
  try {
    const blocks = (
      await Promise.all(images.map((img) => toAnthropicBlock(img.buffer, img.mimeType, img.fileName)))
    ).flat();

    const messageContent: Anthropic.MessageParam["content"] = [
      ...(blocks as (Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | Anthropic.TextBlockParam)[]),
      { type: "text", text: buildVerificationPrompt(form, answers) },
    ];

    const response = await anthropic.messages
      .stream({
        model: "claude-sonnet-4-6",
        max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
        messages: [{ role: "user", content: messageContent }],
      })
      .finalMessage();

    await recordAiFromMessage(db, response, {
      userId,
      caseFileId,
      feature: "form_verification",
      metadata: {
        verification_id: verificationId,
        form_key: form.key,
        ...limitSignalMetadata({
          model: response.model,
          outputTokens: response.usage.output_tokens,
          priorLimit: 4000,
          stopReason: response.stop_reason,
        }),
      },
    });

    if (response.stop_reason === "max_tokens") {
      logTruncation({
        endpoint: "form-verification",
        feature: "form_verification",
        caseFileId,
        userId,
        documentId: verificationId,
        outputTokens: response.usage.output_tokens,
      });
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const parsed = parseVerificationResponse(text, form, answers);

    await db
      .from("form_verifications")
      .update({
        status: parsed.status,
        summary: parsed.summary,
        field_results: parsed.fieldResults,
        updated_at: new Date().toISOString(),
      })
      .eq("id", verificationId);
  } catch (err) {
    console.error("[form-verification] verification failed, keeping upload:", err);
    await db
      .from("form_verifications")
      .update({
        status: "failed",
        summary: "We couldn't read these photos automatically. Your upload is still saved — try retaking the photos in better light, or check your answers against the form yourself.",
        updated_at: new Date().toISOString(),
      })
      .eq("id", verificationId);
  }
}
