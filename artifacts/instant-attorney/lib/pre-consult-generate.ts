import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildPreConsultPrompt } from "./prompts.ts";
import { recordAiFromMessage } from "./usage-tracker.ts";
import { logTruncation } from "./truncation-logger.ts";
import { maxOutputTokensFor, limitSignalMetadata } from "./token-limits.ts";
import type { Attachment, CaseFile, Document, FactItem } from "./types.ts";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export interface PreConsultGenerateResult {
  memo: string;
  truncated: boolean;
}

/** Generate and persist a pre-consult memo for a case file. */
export async function generatePreConsultMemo(
  db: SupabaseClient,
  caseFileId: string,
  actorId: string,
): Promise<PreConsultGenerateResult> {
  const [{ data: caseFileRow }, { data: factRows }, { data: attRows }, { data: docRows }] = await Promise.all([
    db.from("case_files").select("*").eq("id", caseFileId).single(),
    db.from("fact_items").select("*").eq("case_file_id", caseFileId),
    db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
    db.from("documents").select("*").eq("case_file_id", caseFileId).order("created_at", { ascending: false }),
  ]);

  if (!caseFileRow) {
    throw new Error("Case file not found");
  }

  const prompt = buildPreConsultPrompt(
    caseFileRow as CaseFile,
    (factRows ?? []) as FactItem[],
    (attRows ?? []) as Attachment[],
    (docRows ?? []) as Document[],
  );

  const response = await anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
    messages: [{ role: "user", content: prompt }],
  }).finalMessage();

  const memo = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  await recordAiFromMessage(db, response, {
    userId: caseFileRow.user_id,
    actorId,
    caseFileId,
    feature: "attorney_pre_consult",
    metadata: {
      ...limitSignalMetadata({
        model: response.model,
        outputTokens: response.usage.output_tokens,
        priorLimit: 4000,
        stopReason: response.stop_reason,
      }),
    },
  });

  const truncated = response.stop_reason === "max_tokens";
  if (truncated) {
    logTruncation({
      endpoint: "attorney/pre-consult",
      feature: "attorney_pre_consult",
      caseFileId,
      userId: caseFileRow.user_id,
      outputTokens: response.usage.output_tokens,
    });
  }

  await db.from("case_files").update({
    pre_consult_memo: memo,
    updated_at: new Date().toISOString(),
  }).eq("id", caseFileId);

  return { memo, truncated };
}
