import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";
import { BRAINSTORM_SYSTEM_PROMPT, buildBrainstormContext } from "@/lib/prompts";
import { normalizeWrapUp } from "@/lib/consult-wrap-up";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";
import type { CaseFile, FactItem, Attachment, RequestedAttachment } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: messages, error } = await viewer.db
    .from("case_brainstorm_messages")
    .select("*")
    .eq("case_file_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  return NextResponse.json({ messages: messages ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const text = typeof payload?.message === "string" ? payload.message.trim() : "";
  if (!text) return NextResponse.json({ error: "Message is required" }, { status: 400 });

  const { db, userId: actorId } = viewer;

  const [
    { data: caseFileRow },
    { data: factRows },
    { data: attRows },
    { data: reqRows },
    { data: priorMessages },
    { data: consultRow },
  ] = await Promise.all([
    db.from("case_files").select("*").eq("id", id).single(),
    db.from("fact_items").select("*").eq("case_file_id", id),
    db.from("attachments").select("*").eq("case_file_id", id).eq("status", "ready"),
    db.from("requested_attachments").select("*").eq("case_file_id", id),
    db
      .from("case_brainstorm_messages")
      .select("role, content")
      .eq("case_file_id", id)
      .order("created_at", { ascending: true }),
    db
      .from("consult_requests")
      .select("post_consult_plan")
      .eq("case_file_id", id)
      .eq("status", "completed")
      .not("post_consult_plan", "is", null)
      .order("wrap_up_submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!caseFileRow) return NextResponse.json({ error: "Case file not found" }, { status: 404 });
  const caseFile = caseFileRow as CaseFile;

  const latestWrapUp = consultRow?.post_consult_plan ? normalizeWrapUp(consultRow.post_consult_plan) : null;
  const context = buildBrainstormContext(
    caseFile,
    (factRows ?? []) as FactItem[],
    (attRows ?? []) as Attachment[],
    (reqRows ?? []) as RequestedAttachment[],
    latestWrapUp
  );

  await db
    .from("case_brainstorm_messages")
    .insert({ case_file_id: id, author_id: actorId, role: "user", content: text });

  const history = [
    ...((priorMessages ?? []) as { role: "user" | "assistant"; content: string }[]),
    { role: "user" as const, content: text },
  ];

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
    system: [
      { type: "text" as const, text: BRAINSTORM_SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } },
      { type: "text" as const, text: context },
    ],
    messages: history,
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
            userId: caseFile.user_id,
            actorId,
            caseFileId: id,
            feature: "attorney_brainstorm",
            metadata: {
              ...limitSignalMetadata({
                model: finalMsg.model,
                outputTokens: finalMsg.usage.output_tokens,
                priorLimit: 4000,
                stopReason: finalMsg.stop_reason,
              }),
            },
          });
        }

        if (fullResponse) {
          await db.from("case_brainstorm_messages").insert({
            case_file_id: id,
            author_id: null,
            role: "assistant",
            content: fullResponse,
          });
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
