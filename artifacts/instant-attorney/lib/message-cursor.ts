export interface MessageCursor { createdAt: string; id: string }

/** Lexicographic database-message ordering, including the equal-time UUID tie-breaker. */
export function cursorAfter(a: MessageCursor, b: MessageCursor): boolean {
  return a.createdAt > b.createdAt || (a.createdAt === b.createdAt && a.id > b.id);
}
