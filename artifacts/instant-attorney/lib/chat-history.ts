/** Soft cap on chat turns sent to the model — never rejects requests, only trims with a notice. */
export const CHAT_RECENT_MESSAGE_LIMIT = 30;

export type ChatTurn = { role: "user" | "assistant"; content: string };

export interface WindowedChatHistory {
  messages: ChatTurn[];
  /** True when older turns were omitted (living file remains the source of truth). */
  windowed: boolean;
  droppedCount: number;
}

/**
 * Trim redundant chat replay when history is long. The Living File injection carries
 * confirmed facts/strategy — omitted turns are recoverable from there, not lost.
 * Never throws; never blocks the request.
 */
export function windowChatHistory(
  messages: ChatTurn[],
  limit = CHAT_RECENT_MESSAGE_LIMIT,
): WindowedChatHistory {
  const normalized = messages.filter(
    (m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string",
  ) as ChatTurn[];

  if (normalized.length <= limit) {
    return { messages: normalized, windowed: false, droppedCount: 0 };
  }

  const droppedCount = normalized.length - limit;
  const recent = normalized.slice(-limit);
  const notice: ChatTurn = {
    role: "user",
    content:
      `[System note: ${droppedCount} earlier message(s) in this intake are omitted from chat context to save tokens. ` +
      `The CURRENT LIVING FILE block above is authoritative for all confirmed facts, gaps, strategy, and attachments — ` +
      `use it rather than expecting full chat replay.]`,
  };

  return { messages: [notice, ...recent], windowed: true, droppedCount };
}

/** Normalize DB / client rows to chat turns. */
export function toChatTurns(
  rows: Array<{ role: string; content: string }>,
): ChatTurn[] {
  return rows
    .filter((r) => r.role === "user" || r.role === "assistant")
    .map((r) => ({ role: r.role as "user" | "assistant", content: r.content }));
}
