/**
 * Shared AI client factories.
 *
 * Anthropic continues to use @anthropic-ai/sdk with the existing
 * Claude_Instant_Attorney env var (with ANTHROPIC_API_KEY as fallback).
 * xAI uses the OpenAI-compatible Chat Completions API at api.x.ai.
 */

import Anthropic from "@anthropic-ai/sdk";

const XAI_BASE_URL = "https://api.x.ai/v1";

let anthropicSingleton: Anthropic | null = null;

export function anthropicApiKey(): string | undefined {
  return process.env.Claude_Instant_Attorney || process.env.ANTHROPIC_API_KEY || undefined;
}

export function xaiApiKey(): string | undefined {
  return process.env.XAI_API_KEY || undefined;
}

export function isXaiConfigured(): boolean {
  return Boolean(xaiApiKey());
}

export function getAnthropicClient(): Anthropic {
  if (!anthropicSingleton) {
    // Match prior route behavior: construct even if env is unset (SDK call fails later).
    anthropicSingleton = new Anthropic({
      apiKey: anthropicApiKey(),
      maxRetries: 4,
    });
  }
  return anthropicSingleton;
}

export function getXaiBaseUrl(): string {
  return process.env.XAI_BASE_URL?.replace(/\/$/, "") || XAI_BASE_URL;
}
