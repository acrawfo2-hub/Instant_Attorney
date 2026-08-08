import type { StrengthCheck } from "./strength-check-types.ts";
import type { LegalStrategy } from "./types.ts";

// Persistence for the Strength Check — kept free of server-only imports (no
// Anthropic SDK, no @/ aliases) so it can be unit-tested under node:test.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Persist the check at legal_strategy.strength_check without clobbering
 * concurrent strategy writes. legal_strategy is a whole-column JSONB write
 * everywhere (extractor, document-plan route), and the analysis run takes
 * minutes — so a naive read-early/write-late spread can silently revert a
 * strategy rewrite that landed mid-run (or be erased by one). We re-read the
 * CURRENT strategy immediately before writing and guard the update with the
 * row's updated_at (optimistic compare-and-retry): if another writer bumped the
 * row between our read and write, zero rows match and we retry against the new
 * state. Throws when it cannot save — callers must not report success then.
 */
export async function saveStrengthCheck(
  db: Db,
  caseFileId: string,
  check: StrengthCheck,
  attempts = 4,
): Promise<void> {
  for (let i = 0; i < attempts; i++) {
    const { data: fresh, error: readErr } = await db
      .from("case_files")
      .select("legal_strategy, updated_at")
      .eq("id", caseFileId)
      .single();
    if (readErr || !fresh) throw new Error("Could not save the analysis to your file — try again.");
    const strategy = ((fresh.legal_strategy as LegalStrategy | null) ?? {}) as LegalStrategy;

    let q = db
      .from("case_files")
      .update({
        legal_strategy: { ...strategy, strength_check: check },
        updated_at: new Date().toISOString(),
      })
      .eq("id", caseFileId);
    // Match the row state we read. updated_at can be null on old rows.
    q = fresh.updated_at === null ? q.is("updated_at", null) : q.eq("updated_at", fresh.updated_at);
    const { data: updated, error: saveErr } = await q.select("id");
    if (saveErr) {
      console.error("[strength-check] save failed:", saveErr.message);
      throw new Error("Could not save the analysis to your file — try again.");
    }
    if ((updated ?? []).length > 0) return; // committed
    // Lost the race — another writer changed the row; retry against fresh state.
  }
  throw new Error("Could not save the analysis to your file — try again.");
}
