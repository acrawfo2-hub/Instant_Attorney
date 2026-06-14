/**
 * Centralized output-token ceilings for the AI pipeline.
 *
 * We intentionally do NOT cap generation at small artificial limits anymore —
 * each model runs up to its full output ceiling so attorney documents come out
 * complete. The previous (small) caps are still passed to `limitSignalMetadata`
 * as `priorLimit` so we can RECORD when a call would have been truncated under
 * the old limits. Those signals land in `usage_events.metadata` and surface on
 * the attorney-only /admin dashboard for optimization loops.
 */

/** Max output tokens supported per model (Claude 4.x generation). */
export const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  "claude-sonnet-4-6": 64000,
  "claude-opus-4-6": 32000,
  "claude-haiku-4-5-20251001": 64000,
};

/** Conservative fallback for any model not in the map. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16000;

/** Resolve the full output ceiling for a model. */
export function maxOutputTokensFor(model: string): number {
  return MODEL_MAX_OUTPUT_TOKENS[model] ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

export interface LimitSignalMetadata {
  /** Marks this usage_event as carrying token-limit telemetry. */
  token_limit_tracked: true;
  /** The old artificial cap this call used to run under. */
  prior_limit: number;
  /** The full model ceiling the call now runs under. */
  model_max: number;
  /** Actual output tokens the model produced. */
  output_tokens: number;
  /** True when output >= prior cap — i.e. the old limit WOULD have truncated it. */
  would_have_truncated: boolean;
  /** True when output still hit the full model ceiling (a real truncation now). */
  still_truncated: boolean;
}

/**
 * Build metadata describing whether a completed AI call would have hit the
 * previous (now-removed) max_tokens cap. Merge the result into the
 * `recordAiFromMessage` / `recordAiUsage` metadata so /admin can surface it.
 */
export function limitSignalMetadata(params: {
  model: string;
  outputTokens: number;
  priorLimit: number;
  stopReason?: string | null;
}): LimitSignalMetadata {
  return {
    token_limit_tracked: true,
    prior_limit: params.priorLimit,
    model_max: maxOutputTokensFor(params.model),
    output_tokens: params.outputTokens,
    would_have_truncated: params.outputTokens >= params.priorLimit,
    still_truncated: params.stopReason === "max_tokens",
  };
}
