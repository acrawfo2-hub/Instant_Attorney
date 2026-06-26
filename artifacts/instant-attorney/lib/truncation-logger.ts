export interface TruncationContext {
  endpoint: string;
  feature?: string;
  documentId?: string | null;
  caseFileId?: string | null;
  userId?: string | null;
  outputTokens?: number;
}

/**
 * Log a structured warning when an AI response was cut off (stop_reason === "max_tokens").
 * Call this any time you detect truncation — the process must always continue with whatever
 * the model returned. Never throws.
 */
export function logTruncation(ctx: TruncationContext): void {
  try {
    const parts: string[] = [
      "[TRUNCATION WARN]",
      `endpoint=${ctx.endpoint}`,
      ...(ctx.feature ? [`feature=${ctx.feature}`] : []),
      ...(ctx.documentId ? [`document_id=${ctx.documentId}`] : []),
      ...(ctx.caseFileId ? [`case_file_id=${ctx.caseFileId}`] : []),
      ...(ctx.userId ? [`user_id=${ctx.userId}`] : []),
      ...(ctx.outputTokens !== undefined ? [`output_tokens=${ctx.outputTokens}`] : []),
      "stop_reason=max_tokens",
    ];
    console.warn(
      parts.join(" ") +
        " — AI response was cut off mid-generation; partial result saved and process continued"
    );
  } catch {
    // Never throw from a logger
  }
}
