import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { ACP_CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import { BYPASS_USER_ID } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { messages, caseFileId } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  let userId: string;
  let resolvedCaseFileId: string = caseFileId;

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify active subscription
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

  // Save the last user message
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  if (lastUserMsg) {
    await db.from("intake_messages").insert({
      case_file_id: resolvedCaseFileId,
      user_id: userId,
      role: "user",
      content: lastUserMsg.content,
    });
  }

  // Stream from Anthropic
  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    system: ACP_CHAT_SYSTEM_PROMPT,
    messages,
  });

  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      // Prepend the case file ID so the client can track it
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
        // Save assistant response after stream completes
        if (fullResponse) {
          await db.from("intake_messages").insert({
            case_file_id: resolvedCaseFileId,
            user_id: userId,
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
