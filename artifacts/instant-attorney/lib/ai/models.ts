/**
 * Central model registry + resolver.
 *
 * Routes should ask resolveModel() instead of hardcoding provider/model IDs.
 * User preference currently swaps only the workhorse tier; cheap/premium stay
 * on Anthropic until adapters exist for those jobs.
 */

import {
  DEFAULT_AI_PROVIDER,
  parseAiProvider,
  type AiProvider,
  type PreferredAiProvider,
} from "@/lib/ai/providers";

/** Capability tier used across the product. */
export type ModelTier = "workhorse" | "cheap" | "premium";

export interface ModelSpec {
  provider: AiProvider;
  /** Exact API model id — must match usage-tracker pricing keys. */
  modelId: string;
  tier: ModelTier;
  label: string;
  /** Anthropic prompt caching / server web tools / PDF document blocks. */
  supportsAnthropicCache: boolean;
  supportsAnthropicServerTools: boolean;
  supportsAnthropicDocumentBlocks: boolean;
}

const MODELS = {
  sonnet: {
    provider: "anthropic",
    modelId: "claude-sonnet-4-6",
    tier: "workhorse",
    label: "Claude Sonnet 4.6",
    supportsAnthropicCache: true,
    supportsAnthropicServerTools: true,
    supportsAnthropicDocumentBlocks: true,
  },
  haiku: {
    provider: "anthropic",
    modelId: "claude-haiku-4-5-20251001",
    tier: "cheap",
    label: "Claude Haiku 4.5",
    supportsAnthropicCache: true,
    supportsAnthropicServerTools: false,
    supportsAnthropicDocumentBlocks: true,
  },
  opus: {
    provider: "anthropic",
    modelId: "claude-opus-4-8",
    tier: "premium",
    label: "Claude Opus 4.8",
    supportsAnthropicCache: true,
    supportsAnthropicServerTools: false,
    supportsAnthropicDocumentBlocks: true,
  },
  grokWorkhorse: {
    provider: "xai",
    modelId: "grok-4.5",
    tier: "workhorse",
    label: "Grok 4.5",
    supportsAnthropicCache: false,
    supportsAnthropicServerTools: false,
    supportsAnthropicDocumentBlocks: false,
  },
} as const satisfies Record<string, ModelSpec>;

export type ResolveModelReason =
  | "preference"
  | "tier_locked_anthropic"
  | "capability_fallback_anthropic"
  | "xai_unavailable"
  | "default";

export interface ResolveModelInput {
  tier: ModelTier;
  preference?: PreferredAiProvider | null;
  /**
   * When true, the call needs Anthropic-only capabilities (server web tools,
   * PDF document blocks, prompt-cache system blocks). Forces Anthropic even if
   * the user prefers Grok.
   */
  requiresAnthropicCapabilities?: boolean;
  /** When false, Grok is not offered (missing API key). */
  xaiConfigured?: boolean;
}

export interface ResolvedModel extends ModelSpec {
  preference: PreferredAiProvider;
  reason: ResolveModelReason;
}

export function resolveModel(input: ResolveModelInput): ResolvedModel {
  const preference = parseAiProvider(input.preference ?? DEFAULT_AI_PROVIDER);
  const xaiConfigured = input.xaiConfigured !== false;

  if (input.tier === "cheap") {
    return { ...MODELS.haiku, preference, reason: "tier_locked_anthropic" };
  }
  if (input.tier === "premium") {
    return { ...MODELS.opus, preference, reason: "tier_locked_anthropic" };
  }

  // workhorse
  if (preference === "xai") {
    if (input.requiresAnthropicCapabilities) {
      return { ...MODELS.sonnet, preference, reason: "capability_fallback_anthropic" };
    }
    if (!xaiConfigured) {
      return { ...MODELS.sonnet, preference, reason: "xai_unavailable" };
    }
    return { ...MODELS.grokWorkhorse, preference, reason: "preference" };
  }

  return { ...MODELS.sonnet, preference, reason: preference === "anthropic" ? "preference" : "default" };
}

export function workhorseModelIdForProvider(provider: AiProvider): string {
  return provider === "xai" ? MODELS.grokWorkhorse.modelId : MODELS.sonnet.modelId;
}

export const WORKHORSE_MODELS = {
  anthropic: MODELS.sonnet,
  xai: MODELS.grokWorkhorse,
} as const;
