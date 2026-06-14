import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { FREE_CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor } from "@/lib/token-limits";

const client = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney });

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Invalid messages", { status: 400 });
  }

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
    system: FREE_CHAT_SYSTEM_PROMPT,
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
          // Sentinel the client can detect to show a soft truncation notice.
          // \x01 is a non-printable ASCII control character that never appears in AI text.
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
