import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { logTruncation } from "@/lib/truncation-logger";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ACP_CHAT_SYSTEM_PROMPT, buildFileContext } from "@/lib/prompts";
import { parseAndUpdateFile, isCompleteFileUpdate } from "@/lib/file-parser";
import { triggerPendingLookups } from "@/lib/gov-form-lookup";
import { generateCaseTitle } from "@/lib/title-generator";
import { toAnthropicBlock, processAttachment } from "@/lib/attachment-processor";
import { recordAiFromMessage, recordStorageUpload } from "@/lib/usage-tracker";
import { getBillingGate } from "@/lib/topup";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, FactItem, Attachment, RequestedAttachment } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { messages, caseFileId, pendingAttachment, fileType } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    caseFileId?: string;
    fileType?: "standard" | "quick_consult";
    pendingAttachment?: { data: string; mimeType: string; fileName: string };
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

    const { data: sub } = await db
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    const activeStatuses = ["active", "trialing", "bypass"];
    if (!sub || !activeStatuses.includes(sub.status)) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    userId = user.id;

    // Pre-call billing gate: block new AI spend while a top-up is pending/failed.
    const gate = await getBillingGate(userId);
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

  // Ensure case file exists
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

  // Load current file state + attachments for context injection
  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", resolvedCaseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", resolvedCaseFileId),
      db.from("attachments").select("*").eq("case_file_id", resolvedCaseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", resolvedCaseFileId),
    ]);

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

  // Save the last user message text (save text content only). Capture its id so an
  // inline screenshot uploaded below can be linked back to this exact message and
  // reattached to the right bubble when the conversation is reloaded.
  let userMessageId: string | null = null;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    const textToSave = pendingAttachment
      ? `[${pendingAttachment.fileName}]\n${lastUserMsg.content}`
      : lastUserMsg.content;
    const { data: insertedMsg } = await db
      .from("intake_messages")
      .insert({
        case_file_id: resolvedCaseFileId,
        user_id: userId,
        role: "user",
        content: textToSave,
      })
      .select("id")
      .single();
    userMessageId = insertedMsg?.id ?? null;
  }

  // Stream from Anthropic
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
    system: [
      {
        type: "text" as const,
        text: ACP_CHAT_SYSTEM_PROMPT,
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
                    attachment_type: "screenshot",
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
