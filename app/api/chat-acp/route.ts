import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ACP_CHAT_SYSTEM_PROMPT, buildFileContext } from "@/lib/prompts";
import { parseAndUpdateFile } from "@/lib/file-parser";
import { triggerPreWarm } from "@/lib/pre-warm";
import { toAnthropicBlock, processAttachment } from "@/lib/attachment-processor";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, FactItem, LegalStrategy, Attachment, RequestedAttachment } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { messages, caseFileId, pendingAttachment } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    caseFileId?: string;
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
      const { data: created, error } = await db
        .from("case_files")
        .insert({ user_id: userId })
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

  const systemPrompt = fileContext
    ? `${fileContext}\n\n${ACP_CHAT_SYSTEM_PROMPT}`
    : ACP_CHAT_SYSTEM_PROMPT;

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

  // Save the last user message text (save text content only)
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    const textToSave = pendingAttachment
      ? `[${pendingAttachment.fileName}]\n${lastUserMsg.content}`
      : lastUserMsg.content;
    await db.from("intake_messages").insert({
      case_file_id: resolvedCaseFileId,
      user_id: userId,
      role: "user",
      content: textToSave,
    });
  }

  // Stream from Anthropic
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: systemPrompt,
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

          if (hasLivingFile || hasStrategy || hasRequestedAttachments) {
            try {
              await parseAndUpdateFile(db, resolvedCaseFileId, userId, fullResponse);
            } catch (parseErr) {
              console.error("[chat-acp] file parser error:", parseErr);
            }
          }

          // Pre-warm the top recommended wizard when strategy is first established
          if (hasStrategy) {
            try {
              const { data: freshFile } = await db
                .from("case_files")
                .select("legal_strategy")
                .eq("id", resolvedCaseFileId)
                .single();

              const strategy = freshFile?.legal_strategy as LegalStrategy | null;
              const topWizard = strategy?.recommended_wizards?.[0];
              if (topWizard) {
                triggerPreWarm(db, resolvedCaseFileId, userId, topWizard).catch(
                  (err) => console.error("[chat-acp] pre-warm error:", err)
                );
              }
            } catch (err) {
              console.error("[chat-acp] pre-warm trigger error:", err);
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
                const { data: att } = await db
                  .from("attachments")
                  .insert({
                    case_file_id: resolvedCaseFileId,
                    user_id: userId,
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
