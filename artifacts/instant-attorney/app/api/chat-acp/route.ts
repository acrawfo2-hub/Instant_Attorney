import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { logTruncation } from "@/lib/truncation-logger";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildAcpSystemPrompt, buildFileContext } from "@/lib/prompts";
import { detectAcpAreasFromContext } from "@/lib/acp-area-router";
import { parseAndUpdateFile, isCompleteFileUpdate } from "@/lib/file-parser";
import { syncLivingFile } from "@/lib/living-file-extractor";
import { triggerPendingLookups } from "@/lib/gov-form-lookup";
import { generateCaseTitle } from "@/lib/title-generator";
import { toAnthropicBlock, processAttachment } from "@/lib/attachment-processor";
import { recordAiFromMessage, recordStorageUpload } from "@/lib/usage-tracker";
import { getBillingGate } from "@/lib/topup";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, FactItem, Attachment, RequestedAttachment, CounselEngagementGoal } from "@/lib/types";
import { buildCounselContextPatch, persistCounselContext } from "@/lib/existing-counsel-persist";
import {
  jurisdictionFromCaseFileText,
  normalizeStateCode,
  stateName,
} from "@/lib/jurisdiction";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { messages, caseFileId, pendingAttachment, fileType, counselContext, mode } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    caseFileId?: string;
    fileType?: "standard" | "quick_consult";
    mode?: "intake" | "freestyle";
    pendingAttachment?: { data: string; mimeType: string; fileName: string };
    counselContext?: {
      has_existing_counsel: boolean;
      unsure?: boolean;
      existing_counsel_name?: string;
      counsel_engagement_goal?: CounselEngagementGoal | null;
    };
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  let userId: string;
  let resolvedCaseFileId: string = caseFileId ?? "";

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    userId = user.id;

    // The subscription check and the billing gate both depend only on the user
    // id, so run them concurrently to shave a DB round-trip off the latency
    // before the model stream can start.
    const [{ data: sub }, gate] = await Promise.all([
      db
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .maybeSingle(),
      // Pre-call billing gate: block new AI spend while a top-up is pending/failed.
      getBillingGate(user.id),
    ]);

    const activeStatuses = ["active", "trialing", "bypass"];
    if (!sub || !activeStatuses.includes(sub.status)) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    if (!gate.allowed) {
      return NextResponse.json(
        {
          error: "Token top-up required",
          reason: gate.reason,
          meter_usd: gate.meterUsd,
          threshold_usd: gate.thresholdUsd,
        },
        { status: 402 }
      );
    }
  }

  // Ensure case file exists — seed jurisdiction from the client's home_state.
  const { data: homeStateRow } = await db
    .from("profiles")
    .select("home_state")
    .eq("id", userId)
    .maybeSingle();
  const profileHomeState = normalizeStateCode(homeStateRow?.home_state ?? null);

  if (!resolvedCaseFileId) {
    const { data: existing } = await db
      .from("case_files")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      resolvedCaseFileId = existing.id;
    } else {
      const newFileData: Record<string, unknown> = { user_id: userId };
      if (fileType === "quick_consult") {
        newFileData.file_type = "quick_consult";
        newFileData.archive_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
      if (profileHomeState && profileHomeState !== "OTHER") {
        newFileData.jurisdiction = stateName(profileHomeState);
      } else if (profileHomeState === "OTHER") {
        newFileData.jurisdiction = "Outside the United States";
      }
      const { data: created, error } = await db
        .from("case_files")
        .insert(newFileData)
        .select("id")
        .single();
      if (error || !created) {
        return NextResponse.json({ error: "Failed to create case file" }, { status: 500 });
      }
      resolvedCaseFileId = created.id;
    }
  }

  // Apply counsel intake from the pre-chat modal when the file has not recorded it yet.
  if (counselContext && resolvedCaseFileId) {
    const { data: intakeRow } = await db
      .from("case_files")
      .select("counsel_intake_at")
      .eq("id", resolvedCaseFileId)
      .maybeSingle();

    if (!intakeRow?.counsel_intake_at) {
      const built = buildCounselContextPatch(counselContext);
      if (!("error" in built)) {
        await persistCounselContext(
          db,
          resolvedCaseFileId,
          userId,
          built,
          counselContext.has_existing_counsel === true
        );
      }
    }
  }

  // Persist the client's chosen chat mode so reopening the file resumes it.
  // Fire-and-forget — a failed write never blocks the reply, and the mode used
  // for THIS turn comes from the request body regardless.
  if (mode === "freestyle" || mode === "intake") {
    db.from("case_files").update({ chat_mode: mode }).eq("id", resolvedCaseFileId)
      .then(undefined, (err) => console.error("[chat-acp] chat_mode persist error:", err));
  }

  // Load current file state + attachments for context injection
  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }, { data: accountRow }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", resolvedCaseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", resolvedCaseFileId),
      db.from("attachments").select("*").eq("case_file_id", resolvedCaseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", resolvedCaseFileId),
      db.from("profiles").select("account_type").eq("id", userId).maybeSingle(),
    ]);

  // Attorney-users get a reframed intake persona (no privilege/representation
  // language) — see buildAcpCoreHead/buildAcpCoreTail in lib/prompts.ts.
  const acpPersona = accountRow?.account_type === "attorney_user" ? "attorney_user" as const : "client" as const;

  const caseFile = caseFileRow as CaseFile | null;
  const facts = (factRows ?? []) as FactItem[];
  const attachments = (attachmentRows ?? []) as Attachment[];
  const requestedAttachments = (requestedRows ?? []) as RequestedAttachment[];

  const fileContext = caseFile
    ? buildFileContext(caseFile, facts, attachments, requestedAttachments)
    : "";

  // Build Anthropic messages — replace last user message with multimodal if attachment present
  type AnthropicMessage = { role: "user" | "assistant"; content: Anthropic.MessageParam["content"] };
  const anthropicMessages: AnthropicMessage[] = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  if (pendingAttachment) {
    const lastUserIdx = [...anthropicMessages].map((m, i) => ({ m, i }))
      .reverse()
      .find(({ m }) => m.role === "user")?.i ?? -1;

    if (lastUserIdx >= 0) {
      try {
        const buffer = Buffer.from(pendingAttachment.data, "base64");
        const blocks = await toAnthropicBlock(buffer, pendingAttachment.mimeType, pendingAttachment.fileName);
        const textContent = typeof anthropicMessages[lastUserIdx].content === "string"
          ? anthropicMessages[lastUserIdx].content as string
          : "";

        anthropicMessages[lastUserIdx] = {
          role: "user",
          content: [
            ...blocks as (Anthropic.ImageBlockParam | Anthropic.DocumentBlockParam | Anthropic.TextBlockParam)[],
            ...(textContent ? [{ type: "text" as const, text: textContent }] : []),
          ],
        };
      } catch (err) {
        console.error("[chat-acp] failed to build attachment block:", err);
      }
    }
  }

  // Persist the last user message concurrently with the model stream rather than
  // blocking time-to-first-token on the insert. Only the inline-screenshot path
  // (after the stream) needs its id; the stream's finally awaits this promise
  // before the response closes, so persistence is still guaranteed.
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userMessagePromise: Promise<string | null> = lastUserMsg
    ? (async () => {
        try {
          const { data } = await db
            .from("intake_messages")
            .insert({
              case_file_id: resolvedCaseFileId,
              user_id: userId,
              role: "user",
              content: pendingAttachment
                ? `[${pendingAttachment.fileName}]\n${lastUserMsg.content}`
                : lastUserMsg.content,
            })
            .select("id")
            .single();
          return data?.id ?? null;
        } catch (err) {
          console.error("[chat-acp] failed to persist user message:", err);
          return null;
        }
      })()
    : Promise.resolve(null);

  // Route the deep-dive practice-area modules: load only the law this matter
  // implicates (detected from the conversation + case file) instead of all eight
  // areas every turn. prompts.ts always includes the compact area index, so an
  // as-yet-unmatched opening turn still degrades gracefully.
  const detectedAreas = detectAcpAreasFromContext(messages, caseFile);

  // Backfill jurisdiction from profile when the Living File has none yet.
  let effectiveJurisdiction = caseFile?.jurisdiction ?? null;
  if (!jurisdictionFromCaseFileText(effectiveJurisdiction) && profileHomeState) {
    effectiveJurisdiction =
      profileHomeState === "OTHER" ? "Outside the United States" : stateName(profileHomeState);
    if (resolvedCaseFileId && !caseFile?.jurisdiction) {
      await db
        .from("case_files")
        .update({ jurisdiction: effectiveJurisdiction })
        .eq("id", resolvedCaseFileId);
      if (caseFile) caseFile.jurisdiction = effectiveJurisdiction;
    }
  }

  const chatMode = mode === "freestyle" ? "freestyle" : "intake";
  const acpSystemPrompt = buildAcpSystemPrompt(detectedAreas, acpPersona, {
    homeState: profileHomeState,
    jurisdiction: effectiveJurisdiction,
    mode: chatMode,
  });

  // Stream from Anthropic
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
    system: [
      {
        type: "text" as const,
        text: acpSystemPrompt,
        cache_control: { type: "ephemeral" as const },
      },
      ...(fileContext ? [{ type: "text" as const, text: fileContext }] : []),
    ],
    messages: anthropicMessages,
  });

  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(`\x00${resolvedCaseFileId}\x00`));

      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullResponse += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        const finalMsg = await stream.finalMessage().catch(() => null);
        if (finalMsg) {
          await recordAiFromMessage(db, finalMsg, {
            userId,
            actorId: userId,
            caseFileId: resolvedCaseFileId,
            feature: "chat_acp",
            metadata: { ...limitSignalMetadata({
              model: finalMsg.model,
              outputTokens: finalMsg.usage.output_tokens,
              priorLimit: 4000,
              stopReason: finalMsg.stop_reason,
            }) },
          });
        }

        // The user-message insert was kicked off before the stream to keep it
        // off time-to-first-token; await it here so its id is available for the
        // screenshot path below and persistence is flushed before the response
        // closes.
        const userMessageId = await userMessagePromise;

        if (fullResponse) {
          await db.from("intake_messages").insert({
            case_file_id: resolvedCaseFileId,
            user_id: userId,
            role: "assistant",
            content: fullResponse,
          });

          // Parse and update file if response contains structured blocks
          const hasLivingFile = fullResponse.includes("---LIVING FILE---");
          const hasStrategy = fullResponse.includes("---LEGAL STRATEGY---");
          const hasRequestedAttachments = fullResponse.includes("---REQUESTED ATTACHMENTS---");
          const hasGovForms = fullResponse.includes("---GOVERNMENT FORMS---");

          if (hasLivingFile || hasStrategy || hasRequestedAttachments || hasGovForms) {
            // Warn when the model emitted a FILE UPDATE opening marker but the
            // closing marker is missing — parseAndUpdateFile will safely skip it,
            // but log it so we can see how often truncation silently drops updates.
            const hasFileUpdateBlock = fullResponse.includes("---FILE UPDATE---");
            if (hasFileUpdateBlock && !isCompleteFileUpdate(fullResponse)) {
              console.warn(
                "[chat-acp] Living File block detected but incomplete (truncated?) — update skipped.",
                { caseFileId: resolvedCaseFileId, responseLength: fullResponse.length }
              );
            }

            try {
              await parseAndUpdateFile(db, resolvedCaseFileId, userId, fullResponse);

              // When the model emitted a COMPLETE inline Living File block this
              // turn, advance the sync watermark so the background extractor
              // doesn't reprocess these same messages and produce near-duplicate
              // facts (upsertFacts only dedupes exact matches). Incomplete blocks
              // are left un-watermarked so the extractor still catches them.
              if (hasLivingFile && fullResponse.includes("---END FILE---")) {
                await db
                  .from("case_files")
                  .update({ last_file_synced_at: new Date().toISOString() })
                  .eq("id", resolvedCaseFileId)
                  .then(undefined, (err) =>
                    console.error("[chat-acp] inline watermark advance error:", err)
                  );
              }

              // Kick off grounded web lookups for any newly-detected forms that
              // aren't in the curated registry (fire-and-forget, non-blocking).
              if (hasGovForms) {
                triggerPendingLookups(anthropic, db, resolvedCaseFileId, userId).catch(
                  (err) => console.error("[chat-acp] gov-form lookup trigger error:", err)
                );
              }

              // Generate a title after the first living file update if one isn't set yet
              if (hasLivingFile && caseFile && !caseFile.title) {
                const { data: freshFile } = await db
                  .from("case_files")
                  .select("title, summary, matter_type, matter_subtype")
                  .eq("id", resolvedCaseFileId)
                  .single();
                if (freshFile && !freshFile.title) {
                  generateCaseTitle(
                    db, resolvedCaseFileId,
                    freshFile.summary ?? "",
                    freshFile.matter_type,
                    freshFile.matter_subtype
                  ).catch((err) => console.error("[chat-acp] title gen error:", err));
                }
              }
            } catch (parseErr) {
              console.error("[chat-acp] file parser error:", parseErr);
            }
          }

          // Upload inline screenshot to storage + queue background analysis
          if (pendingAttachment) {
            try {
              const buffer = Buffer.from(pendingAttachment.data, "base64");
              const fileId = randomUUID();
              const storagePath = `${userId}/${resolvedCaseFileId}/${fileId}-${pendingAttachment.fileName}`;

              const serviceDb = createServiceClient();
              const { error: uploadErr } = await serviceDb.storage
                .from("case-attachments")
                .upload(storagePath, buffer, {
                  contentType: pendingAttachment.mimeType,
                  upsert: false,
                });

              if (!uploadErr) {
                await recordStorageUpload(db, {
                  userId,
                  actorId: userId,
                  caseFileId: resolvedCaseFileId,
                  bytes: buffer.length,
                  fileName: pendingAttachment.fileName,
                  mimeType: pendingAttachment.mimeType,
                });

                const { data: att } = await db
                  .from("attachments")
                  .insert({
                    case_file_id: resolvedCaseFileId,
                    user_id: userId,
                    message_id: userMessageId,
                    file_name: pendingAttachment.fileName,
                    file_type: pendingAttachment.mimeType,
                    file_size: buffer.length,
                    storage_path: storagePath,
                    attachment_type: pendingAttachment.mimeType.startsWith("image/") ? "screenshot" : "document",
                    status: "processing",
                  })
                  .select()
                  .single();

                if (att) {
                  processAttachment(
                    serviceDb, att.id, buffer,
                    pendingAttachment.mimeType, pendingAttachment.fileName,
                    resolvedCaseFileId
                  ).catch((err) => console.error("[chat-acp] screenshot processing error:", err));
                }
              }
            } catch (err) {
              console.error("[chat-acp] screenshot storage error:", err);
            }
          }
        }
        // Background Living File sweep (both modes). Debounced inside the
        // extractor — a cheap no-op until enough new messages accumulate — so
        // the file stays current even when this turn emitted no inline block.
        // Fire-and-forget, same lifetime as the other post-stream background
        // tasks above.
        syncLivingFile(anthropic, db, resolvedCaseFileId, userId).catch(
          (err) => console.error("[chat-acp] living file sync error:", err)
        );

        if (finalMsg?.stop_reason === "max_tokens") {
          logTruncation({
            endpoint: "chat-acp",
            feature: "chat_acp",
            userId,
            caseFileId: resolvedCaseFileId,
            outputTokens: finalMsg.usage.output_tokens,
          });
          // Sentinel the client can detect to show a soft truncation notice.
          // \x01 is a non-printable ASCII control character that never appears in AI text.
          controller.enqueue(encoder.encode("\x01TRUNCATED\x01"));
        }
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
