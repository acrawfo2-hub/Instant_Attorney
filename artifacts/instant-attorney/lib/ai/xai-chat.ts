/**
 * Minimal OpenAI-compatible chat streaming client for xAI (Grok).
 *
 * Phase A only needs text streaming + usage for the Living File chat workhorse.
 * Tool loops and multimodal attachments stay on Anthropic until later phases.
 */

import { getXaiBaseUrl, xaiApiKey } from "@/lib/ai/clients";

export interface XaiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface XaiUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens?: number;
  prompt_tokens_details?: {
    cached_tokens?: number;
    text_tokens?: number;
    audio_tokens?: number;
    image_tokens?: number;
  };
}

export interface XaiStreamResult {
  text: string;
  model: string;
  usage: XaiUsage | null;
  finishReason: string | null;
  /** Value of the x-zero-data-retention response header when present. */
  zeroDataRetention: boolean | null;
}

export interface XaiStreamOptions {
  model: string;
  messages: XaiChatMessage[];
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
  onTextDelta?: (delta: string) => void;
}

function parseSseDataLines(chunk: string): string[] {
  const out: string[] = [];
  for (const line of chunk.split("\n")) {
    const trimmed = line.trimEnd();
    if (trimmed.startsWith("data:")) {
      out.push(trimmed.slice(5).trimStart());
    }
  }
  return out;
}

export async function streamXaiChat(opts: XaiStreamOptions): Promise<XaiStreamResult> {
  const apiKey = xaiApiKey();
  if (!apiKey) {
    throw new Error("XAI_API_KEY is not configured");
  }

  const res = await fetch(`${getXaiBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      messages: opts.messages,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature ?? 0.4,
      stream: true,
      stream_options: { include_usage: true },
    }),
    signal: opts.signal,
  });

  const zdrHeader = res.headers.get("x-zero-data-retention");
  const zeroDataRetention =
    zdrHeader === "true" ? true : zdrHeader === "false" ? false : null;

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`xAI chat failed (${res.status}): ${body.slice(0, 400)}`);
  }

  if (!res.body) {
    throw new Error("xAI chat returned an empty body");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let model = opts.model;
  let usage: XaiUsage | null = null;
  let finishReason: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Process complete SSE events (blank-line delimited).
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const event = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      for (const data of parseSseDataLines(event)) {
        if (!data || data === "[DONE]") continue;
        let parsed: {
          model?: string;
          choices?: Array<{
            delta?: { content?: string | null };
            finish_reason?: string | null;
          }>;
          usage?: XaiUsage;
        };
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        if (parsed.model) model = parsed.model;
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          opts.onTextDelta?.(delta);
        }
        const fr = parsed.choices?.[0]?.finish_reason;
        if (fr) finishReason = fr;
        if (parsed.usage) usage = parsed.usage;
      }
    }
  }

  return { text, model, usage, finishReason, zeroDataRetention };
}

/** Build a single system string from Anthropic-style system text blocks. */
export function joinSystemBlocks(blocks: Array<{ text: string }>): string {
  return blocks.map((b) => b.text).filter(Boolean).join("\n\n");
}
