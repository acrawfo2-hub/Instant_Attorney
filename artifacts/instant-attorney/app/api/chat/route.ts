import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { buildFreeChatSystemPrompt } from "@/lib/prompts";
import { normalizeStateCode } from "@/lib/jurisdiction";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor } from "@/lib/token-limits";

const client = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { messages, homeState: rawState } = body as {
    messages?: unknown;
    homeState?: unknown;
  };

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Invalid messages", { status: 400 });
  }

  const homeState =
    typeof rawState === "string" ? normalizeStateCode(rawState) : null;
  const systemText = buildFreeChatSystemPrompt(homeState);

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
    // Cache still helps within a session; state-specific prompts vary by homeState.
    system: [
      {
        type: "text" as const,
        text: systemText,
        cache_control: { type: "ephemeral" as const },
      },
    ],
    messages,
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        const finalMsg = await stream.finalMessage().catch(() => null);
        if (finalMsg?.stop_reason === "max_tokens") {
          logTruncation({
            endpoint: "chat/free",
            feature: "free_chat",
            outputTokens: finalMsg.usage.output_tokens,
          });
          controller.enqueue(encoder.encode("\x01TRUNCATED\x01"));
        }
      } catch (err) {
        controller.error(err);
      } finally {
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
