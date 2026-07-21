import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildAttorneyFreestylePrompt, buildFileContext } from "@/lib/prompts";
import { detectAcpAreasFromContext } from "@/lib/acp-area-router";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";
import { logTruncation } from "@/lib/truncation-logger";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, FactItem, Attachment, RequestedAttachment } from "@/lib/types";

// Attorney drafting/analysis can run long — give the model room.
export const maxDuration = 300;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Attorney FREESTYLE work-product chat. Scoped to a client's case file for
// context, but persisted to attorney_workspace_messages — NOT the client's
// privileged intake_messages record. Attorney-only.
export async function POST(req: NextRequest) {
  const { messages, caseFileId } = await req.json() as {
    messages: Array<{ role: string; content: string }>;
    caseFileId?: string;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }
  if (!caseFileId) {
    return NextResponse.json({ error: "caseFileId required" }, { status: 400 });
  }

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let attorneyId: string;
  if (BYPASS_AUTH) {
    attorneyId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    attorneyId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", attorneyId).single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  // Load the client's file context so the attorney's associate reasons over the
  // actual matter (Living File, facts, attachments).
  const [{ data: caseFileRow }, { data: factRows }, { data: attachmentRows }, { data: requestedRows }] =
    await Promise.all([
      db.from("case_files").select("*").eq("id", caseFileId).single(),
      db.from("fact_items").select("*").eq("case_file_id", caseFileId),
      db.from("attachments").select("*").eq("case_file_id", caseFileId).eq("status", "ready"),
      db.from("requested_attachments").select("*").eq("case_file_id", caseFileId),
    ]);

  const caseFile = caseFileRow as CaseFile | null;
  const facts = (factRows ?? []) as FactItem[];
  const attachments = (attachmentRows ?? []) as Attachment[];
  const requestedAttachments = (requestedRows ?? []) as RequestedAttachment[];

  const fileContext = caseFile
    ? buildFileContext(caseFile, facts, attachments, requestedAttachments)
    : "";

  const detectedAreas = detectAcpAreasFromContext(messages, caseFile);
  const systemPrompt = buildAttorneyFreestylePrompt(detectedAreas);

  const anthropicMessages = messages.map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  // Persist the attorney's message concurrently with the stream (kept off
  // time-to-first-token). This is attorney work-product, not the client record.
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const userMessagePromise: Promise<void> = lastUserMsg
    ? (async () => {
        try {
          await db.from("attorney_workspace_messages").insert({
            case_file_id: caseFileId,
            attorney_id: attorneyId,
            role: "user",
            content: lastUserMsg.content,
          });
        } catch (err) {
          console.error("[attorney-chat] persist user message error:", err);
        }
      })()
    : Promise.resolve();

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
    system: [
      { type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" as const } },
      ...(fileContext ? [{ type: "text" as const, text: fileContext }] : []),
    ],
    messages: anthropicMessages,
  });

  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
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
            userId: attorneyId,
            actorId: attorneyId,
            caseFileId,
            feature: "attorney_chat",
            metadata: { ...limitSignalMetadata({
              model: finalMsg.model,
              outputTokens: finalMsg.usage.output_tokens,
              priorLimit: 4000,
              stopReason: finalMsg.stop_reason,
            }) },
          });
        }

        await userMessagePromise;

        if (fullResponse) {
          await db.from("attorney_workspace_messages").insert({
            case_file_id: caseFileId,
            attorney_id: attorneyId,
            role: "assistant",
            content: fullResponse,
          }).then(undefined, (err) => console.error("[attorney-chat] persist assistant message error:", err));
        }

        if (finalMsg?.stop_reason === "max_tokens") {
          logTruncation({
            endpoint: "attorney-chat",
            feature: "attorney_chat",
            userId: attorneyId,
            caseFileId,
            outputTokens: finalMsg.usage.output_tokens,
          });
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
