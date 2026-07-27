import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIVING_FILE_EXTRACTOR_SYSTEM, buildFileContext } from "./prompts.ts";
import { parseAndUpdateFile } from "./file-parser.ts";
import { recordAiFromMessage } from "./usage-tracker.ts";
import { limitSignalMetadata } from "./token-limits.ts";
import type { CaseFile, FactItem, Attachment, RequestedAttachment } from "./types.ts";

// Cheap, narrow summarizer — a small file block, not legal reasoning.
const EXTRACTOR_MODEL = "claude-haiku-4-5-20251001";
// A Living File block is usually well under this, but a first sweep summarizing a
// long back-catalog of freestyle turns can be larger — keep headroom so the
// closing ---END FILE--- marker isn't truncated off.
const EXTRACTOR_MAX_TOKENS = 4000;

// Debounce: on the automatic per-turn sweep, don't call the model until at least
// this many unsynced messages (~3 turns) have accumulated. A forced flush
// (leaving/toggling the chat) ignores this and syncs whatever is pending.
const MIN_UNSYNCED_MESSAGES = 6;

interface SyncResult {
  synced: boolean;
  processedMessages: number;
  reason?: "no_messages" | "below_threshold" | "no_update" | "updated";
}

// Strip machine-emitted structured blocks from assistant turns so the extractor
// reads the actual dialogue, not artifacts it (or the conversational model)
// already produced.
function stripStructuredBlocks(text: string): string {
  return text
    .replace(/---LIVING FILE---[\s\S]*?---END FILE---/g, "")
    .replace(/---LEGAL STRATEGY---[\s\S]*?---END STRATEGY---/g, "")
    .replace(/---REQUESTED ATTACHMENTS---[\s\S]*?---END REQUESTED---/g, "")
    .replace(/---GOVERNMENT FORMS---[\s\S]*?---END FORMS---/g, "")
    // A freestyle draft is a working document, not case dialogue — keep the whole
    // instrument out of the Living File so it doesn't get mined into facts.
    .replace(/---DRAFT:[ \t]*.*?[ \t]*---\r?\n[\s\S]*?\r?\n?---END DRAFT---/g, "")
    .replace(/\x01TRUNCATED\x01/g, "")
    .trim();
}

/**
 * Background Living File sweep. Reads every intake message newer than the case
 * file's watermark, folds any genuinely new information into the Living File via
 * the existing parser, and advances the watermark so the same messages are never
 * reprocessed. Runs for BOTH chat modes — this is what guarantees the file is
 * kept current even when the conversational model emitted no ---LIVING FILE---
 * block (freestyle, or a skipped guided turn).
 *
 * Safe to call fire-and-forget after every turn: it no-ops cheaply (a single
 * indexed query, no model call) until enough new messages accumulate, unless
 * `force` is set.
 */
export async function syncLivingFile(
  anthropic: Anthropic,
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  opts: { force?: boolean } = {}
): Promise<SyncResult> {
  const { data: caseFileRow } = await db
    .from("case_files")
    .select("*")
    .eq("id", caseFileId)
    .single();
  const caseFile = caseFileRow as CaseFile | null;
  if (!caseFile) return { synced: false, processedMessages: 0, reason: "no_messages" };

  // Only messages the extractor hasn't already folded in. A null watermark
  // (never synced, or pre-migration) means read the whole transcript.
  const watermark = caseFile.last_file_synced_at ?? null;
  let query = db
    .from("intake_messages")
    .select("role, content, created_at")
    .eq("case_file_id", caseFileId)
    .order("created_at", { ascending: true });
  if (watermark) query = query.gt("created_at", watermark);

  const { data: msgRows } = await query;
  const newMessages = (msgRows ?? []) as Array<{ role: string; content: string; created_at: string }>;

  if (newMessages.length === 0) {
    return { synced: false, processedMessages: 0, reason: "no_messages" };
  }
  if (!opts.force && newMessages.length < MIN_UNSYNCED_MESSAGES) {
    return { synced: false, processedMessages: newMessages.length, reason: "below_threshold" };
  }

  const lastCreatedAt = newMessages[newMessages.length - 1].created_at;

  // Advance the watermark to the last processed message. Called only after the
  // model call succeeds (or when there's nothing to send), so a failed call
  // leaves the window for the next sweep to retry rather than dropping it. A
  // missing column (pre-migration) is swallowed.
  const advanceWatermark = async () => {
    await db
      .from("case_files")
      .update({ last_file_synced_at: lastCreatedAt })
      .eq("id", caseFileId)
      .then(undefined, (err) => console.error("[living-file-extractor] watermark advance error:", err));
  };

  // Current file + the new dialogue, as the model's single user message.
  const [{ data: factRows }, { data: attachmentRows }, { data: requestedRows }] = await Promise.all([
    db.from("fact_items").select("*").eq("case_file_id", caseFileId),
    db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
    db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
  ]);
  const fileContext = buildFileContext(
    caseFile,
    (factRows ?? []) as FactItem[],
    (attachmentRows ?? []) as Attachment[],
    (requestedRows ?? []) as RequestedAttachment[]
  );

  const transcript = newMessages
    .map((m) => {
      const speaker = m.role === "user" ? "CLIENT" : "ASSISTANT";
      const body = m.role === "user" ? m.content : stripStructuredBlocks(m.content);
      return body ? `${speaker}: ${body}` : "";
    })
    .filter(Boolean)
    .join("\n\n");

  if (!transcript.trim()) {
    await advanceWatermark();
    return { synced: false, processedMessages: newMessages.length, reason: "no_update" };
  }

  const userMessage =
    `=== CURRENT LIVING FILE ===\n${fileContext || "(empty — no file yet)"}\n\n` +
    `=== NEW CONVERSATION SINCE LAST UPDATE ===\n${transcript}`;

  let finalMsg: Anthropic.Message | null = null;
  try {
    finalMsg = await anthropic.messages.create({
      model: EXTRACTOR_MODEL,
      max_tokens: EXTRACTOR_MAX_TOKENS,
      system: LIVING_FILE_EXTRACTOR_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });
  } catch (err) {
    console.error("[living-file-extractor] model call failed:", err);
    // Do NOT advance the watermark — let the next sweep retry this window.
    return { synced: false, processedMessages: newMessages.length, reason: "no_update" };
  }

  const output = finalMsg.content
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("");

  // Record the summarizer's spend for the /admin cost view.
  await recordAiFromMessage(db, finalMsg, {
    userId,
    actorId: userId,
    caseFileId,
    feature: "living_file_sync",
    metadata: { ...limitSignalMetadata({
      model: finalMsg.model,
      outputTokens: finalMsg.usage.output_tokens,
      priorLimit: EXTRACTOR_MAX_TOKENS,
      stopReason: finalMsg.stop_reason,
    }) },
  }).catch((err) => console.error("[living-file-extractor] usage record error:", err));

  const hasOpen = output.includes("---LIVING FILE---");
  const hasClose = output.includes("---END FILE---");

  if (!hasOpen) {
    // Model judged there was nothing new to record — the window IS processed,
    // so advance past it so we don't re-read the same messages forever.
    await advanceWatermark();
    return { synced: false, processedMessages: newMessages.length, reason: "no_update" };
  }

  if (!hasClose) {
    // Truncated / malformed block: the opening marker is present but the closer
    // is missing, so parseLivingFile would silently drop it. Do NOT advance the
    // watermark — leave this window for the next sweep to retry (with a fresh
    // token budget) rather than losing the facts in it.
    console.warn(
      "[living-file-extractor] incomplete LIVING FILE block (no ---END FILE---); leaving watermark for retry.",
      { caseFileId, outputTokens: finalMsg.usage.output_tokens, stopReason: finalMsg.stop_reason }
    );
    return { synced: false, processedMessages: newMessages.length, reason: "no_update" };
  }

  // Complete block — write it, THEN advance the watermark so a parse failure
  // never strands a window as "synced".
  await parseAndUpdateFile(db, caseFileId, userId, output);
  await advanceWatermark();
  return { synced: true, processedMessages: newMessages.length, reason: "updated" };
}
