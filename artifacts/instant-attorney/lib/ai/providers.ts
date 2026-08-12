/**
 * AI provider identity for Instant Attorney.
 *
 * Phase A introduces a user preference between Anthropic (Claude) and xAI (Grok).
 * Cheap/premium tiers and Anthropic-only capabilities (server web tools, PDF
 * document blocks) remain Anthropic until later phases.
 */

export type AiProvider = "anthropic" | "xai";

/** Stored on `profiles.preferred_ai_provider`. Default is Anthropic. */
export type PreferredAiProvider = AiProvider;

export const AI_PROVIDERS: readonly AiProvider[] = ["anthropic", "xai"] as const;

export const DEFAULT_AI_PROVIDER: PreferredAiProvider = "anthropic";

export const AI_PROVIDER_LABELS: Record<AiProvider, string> = {
  anthropic: "Claude (Anthropic)",
  xai: "Grok (xAI)",
};

export function isAiProvider(value: unknown): value is AiProvider {
  return value === "anthropic" || value === "xai";
}

export function parseAiProvider(value: unknown): PreferredAiProvider {
  return isAiProvider(value) ? value : DEFAULT_AI_PROVIDER;
}
