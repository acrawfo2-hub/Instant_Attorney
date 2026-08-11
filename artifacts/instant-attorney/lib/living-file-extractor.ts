import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LIVING_FILE_EXTRACTOR_SYSTEM, buildFileContext } from "./prompts.ts";
import { parseAndUpdateFile } from "./file-parser.ts";
import { recordAiFromMessage } from "./usage-tracker.ts";
import { limitSignalMetadata } from "./token-limits.ts";
import type { CaseFile, FactItem, Attachment, RequestedAttachment } from "./types.ts";
import { randomUUID } from "crypto";
import { cursorAfter, type MessageCursor } from "./message-cursor.ts";

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
  reason?: "no_messages" | "below_threshold" | "busy" | "no_update" | "updated";
}

export type { MessageCursor } from "./message-cursor.ts";

const LOCK_SECONDS = 300;
const WINDOW_SIZE = 100;

async function release(db: SupabaseClient, caseFileId: string, token: string) {
  await db.rpc("release_living_file_sync", { p_case_file_id: caseFileId, p_lock_token: token });
}

/** Advance only if both the durable lease and the cursor read for this window still match. */
async function advance(
  db: SupabaseClient, caseFileId: string, token: string,
  before: { createdAt: string; id: string | null } | null, after: MessageCursor,
) {
  const { data, error } = await db.rpc("advance_living_file_cursor", {
    p_case_file_id: caseFileId, p_lock_token: token,
    p_expected_created_at: before?.createdAt ?? null, p_expected_id: before?.id ?? null,
    p_new_created_at: after.createdAt, p_new_id: after.id,
  });
  if (error || data !== true) throw error ?? new Error("Living File cursor compare-and-set failed");
}

/** Marks a complete inline update through its persisted user-message boundary. */
export async function markLivingFileSyncedThrough(
  db: SupabaseClient, caseFileId: string, boundary: MessageCursor,
): Promise<boolean> {
  const token = randomUUID();
  const { data: locked, error } = await db.rpc("acquire_living_file_sync", {
    p_case_file_id: caseFileId, p_lock_token: token, p_lease_seconds: LOCK_SECONDS,
  });
  if (error || locked !== true) return false;
  try {
    const { data: row } = await db.from("case_files")
      .select("last_file_synced_at,last_file_synced_message_id").eq("id", caseFileId).single();
    const before = row?.last_file_synced_at
      ? { createdAt: row.last_file_synced_at, id: row.last_file_synced_message_id ?? null } : null;
    const alreadyPastBoundary = before && (before.createdAt > boundary.createdAt ||
      (before.createdAt === boundary.createdAt && (before.id === null || !cursorAfter(boundary, before as MessageCursor))));
    if (alreadyPastBoundary) {
      await release(db, caseFileId, token);
      return true;
    }
    await advance(db, caseFileId, token, before, boundary);
    return true;
  } catch (err) {
    await release(db, caseFileId, token);
    throw err;
  }
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
  opts: { force?: boolean; through?: MessageCursor } = {}
): Promise<SyncResult> {
  const lockToken = randomUUID();
  const { data: locked, error: lockError } = await db.rpc("acquire_living_file_sync", {
    p_case_file_id: caseFileId, p_lock_token: lockToken, p_lease_seconds: LOCK_SECONDS,
  });
  if (lockError || locked !== true) return { synced: false, processedMessages: 0, reason: "busy" };

  const fail = async (result: SyncResult) => { await release(db, caseFileId, lockToken); return result; };
  const { data: caseFileRow } = await db
    .from("case_files")
    .select("*")
    .eq("id", caseFileId)
    .single();
  const caseFile = caseFileRow as CaseFile | null;
  if (!caseFile) return fail({ synced: false, processedMessages: 0, reason: "no_messages" });

  // Only messages the extractor hasn't already folded in. A null watermark
  // (never synced, or pre-migration) means read the whole transcript.
  const watermark = caseFile.last_file_synced_at
    ? { createdAt: caseFile.last_file_synced_at, id: caseFile.last_file_synced_message_id ?? null } : null;
  let query = db
    .from("intake_messages")
    .select("id, role, content, created_at")
    .eq("case_file_id", caseFileId)
    .order("created_at", { ascending: true }).order("id", { ascending: true }).limit(WINDOW_SIZE);
  if (watermark?.id) query = query.or(`created_at.gt.${watermark.createdAt},and(created_at.eq.${watermark.createdAt},id.gt.${watermark.id})`);
  else if (watermark) query = query.gt("created_at", watermark.createdAt);
  if (opts.through) query = query.or(`created_at.lt.${opts.through.createdAt},and(created_at.eq.${opts.through.createdAt},id.lte.${opts.through.id})`);

  const { data: msgRows } = await query;
  const newMessages = (msgRows ?? []) as Array<{ id: string; role: string; content: string; created_at: string }>;

  if (newMessages.length === 0) {
    return fail({ synced: false, processedMessages: 0, reason: "no_messages" });
  }
  if (!opts.force && newMessages.length < MIN_UNSYNCED_MESSAGES) {
    return fail({ synced: false, processedMessages: newMessages.length, reason: "below_threshold" });
  }

  const last = newMessages[newMessages.length - 1];
  const windowEnd = { createdAt: last.created_at, id: last.id };

  // Advance the watermark to the last processed message. Called only after the
  // model call succeeds (or when there's nothing to send), so a failed call
  // leaves the window for the next sweep to retry rather than dropping it. A
  // missing column (pre-migration) is swallowed.
  const advanceWatermark = () => advance(db, caseFileId, lockToken, watermark, windowEnd);

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

  // Authoritative "as of" date so KEY DATES can resolve relative references
  // ("last Tuesday") deterministically instead of guessing.
  const todayIso = new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" });
  const userMessage =
    `TODAY'S DATE: ${todayIso}\n\n` +
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
    return fail({ synced: false, processedMessages: newMessages.length, reason: "no_update" });
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
    return fail({ synced: false, processedMessages: newMessages.length, reason: "no_update" });
  }

  // Complete block — write it, THEN advance the watermark so a parse failure
  // never strands a window as "synced".
  try {
    await parseAndUpdateFile(db, caseFileId, userId, output);
    await advanceWatermark();
    return { synced: true, processedMessages: newMessages.length, reason: "updated" };
  } catch (err) {
    await release(db, caseFileId, lockToken);
    throw err;
  }
}
