import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { FREE_CHAT_SYSTEM_PROMPT } from "@/lib/prompts";
import { logTruncation } from "@/lib/truncation-logger";

const client = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney });

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response("Invalid messages", { status: 400 });
  }

  const stream = client.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
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
          controller.enqueue(
            encoder.encode(
              "\n\n_This response may be incomplete. Feel free to ask me to continue._"
            )
          );
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
