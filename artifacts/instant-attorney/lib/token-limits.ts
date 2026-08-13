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

/** Max output tokens supported per model. */
export const MODEL_MAX_OUTPUT_TOKENS: Record<string, number> = {
  "claude-sonnet-4-6": 64000,
  "claude-opus-4-8": 64000,
  "claude-opus-4-6": 32000,
  "claude-haiku-4-5-20251001": 64000,
  // Grok 4.5 supports large generations; keep a practical ceiling for chat.
  "grok-4.5": 32000,
};

/** Conservative fallback for any model not in the map. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 16000;

/** Resolve the full output ceiling for a model. */
export function maxOutputTokensFor(model: string): number {
  return MODEL_MAX_OUTPUT_TOKENS[model] ?? DEFAULT_MAX_OUTPUT_TOKENS;
}

/**
 * Per-document-type output ceilings. Used for the expensive Opus second-draft
 * so a single call can't run to the full 64k model ceiling on a document type
 * that is never that long. Caps sit generously above observed output lengths
 * (priorLimit telemetry) so they bound the cost tail without truncating real
 * documents. Keyed by DocType (InstrumentType | DerivedDocType).
 */
export const DOC_TYPE_MAX_OUTPUT_TOKENS: Record<string, number> = {
  demand_letter: 6000,
  complaint_letter: 8000,
  draft_contract: 12000,
  draft_waiver: 6000,
  wills_trusts: 16000,
  doc_review: 8000,
  general_document: 10000,
  critical_review: 6000,
  second_draft: 16000,
};

/** Conservative fallback for an unknown document type. */
export const DEFAULT_DOC_MAX_OUTPUT_TOKENS = 10000;

/**
 * Output ceiling for a generation, bounded by BOTH the model ceiling and the
 * document type's expected length. Always returns the smaller of the two.
 */
export function maxOutputTokensForDoc(model: string, docType?: string | null): number {
  const modelCeiling = maxOutputTokensFor(model);
  const docCap =
    (docType && DOC_TYPE_MAX_OUTPUT_TOKENS[docType]) || DEFAULT_DOC_MAX_OUTPUT_TOKENS;
  return Math.min(modelCeiling, docCap);
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
