/**
 * Per-model USD COGS pricing used by the usage meter.
 * Keep in sync with lib/ai/models.ts model IDs.
 */

export type ModelPricing = {
  input: number;
  output: number;
  /** xAI cached-input rate ($/1M). When set, cacheReadTokens bill at this rate. */
  cachedInput?: number;
};

/** USD per 1M tokens — update when provider pricing changes. */
export const MODEL_PRICING_USD_PER_M: Record<string, ModelPricing> = {
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5-20251001": { input: 0.8, output: 4 },
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-opus-4-8": { input: 15, output: 75 },
  // xAI Grok 4.5 standard context (<200k prompt). Long-context tier is higher;
  // we bill the standard rate until usage metadata exposes the long-context band.
  "grok-4.5": { input: 2, output: 6, cachedInput: 0.3 },
};

const DEFAULT_MODEL_PRICING = MODEL_PRICING_USD_PER_M["claude-sonnet-4-6"];

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function computeAiCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number,
  costMultiplier = 1,
  cacheCreationTokens = 0,
  cacheReadTokens = 0
): number {
  const pricing = MODEL_PRICING_USD_PER_M[model] ?? DEFAULT_MODEL_PRICING;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;

  if (pricing.cachedInput != null) {
    // xAI: prompt_tokens typically includes cached tokens. Bill non-cached input
    // at `input` and cached tokens at `cachedInput`.
    const cached = Math.min(Math.max(0, cacheReadTokens), Math.max(0, inputTokens));
    const nonCached = Math.max(0, inputTokens - cached);
    const inputCost = (nonCached / 1_000_000) * pricing.input;
    const cacheReadCost = (cached / 1_000_000) * pricing.cachedInput;
    return roundUsd((inputCost + cacheReadCost + outputCost) * costMultiplier);
  }

  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  // Anthropic prompt caching: writes cost 1.25x input, reads cost 0.1x input.
  const cacheWriteCost = (cacheCreationTokens / 1_000_000) * pricing.input * 1.25;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * pricing.input * 0.1;
  return roundUsd((inputCost + cacheWriteCost + cacheReadCost + outputCost) * costMultiplier);
}
