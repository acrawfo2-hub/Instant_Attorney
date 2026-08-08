/**
 * Safely coalesces a pending/in-flight save with a promote action so the two
 * never race and a save failure always blocks the promote.
 *
 * Extracted from ChatDraftsPanel so it can be tested without a DOM or React.
 */

export interface PromoteGuardOptions {
  /**
   * A promise that resolves to `true` (save succeeded) or `false` (save
   * failed) if a save is currently in-flight (autosave timer already fired but
   * hasn't settled). `null` when idle.
   */
  inFlightSave: Promise<boolean> | null;

  /**
   * Returns the live dirty flag *after* awaiting the in-flight save, so we
   * can detect edits that arrived while the autosave was running.
   */
  isDirty: () => boolean;

  /** Trigger a fresh save and return whether it succeeded. */
  save: () => Promise<boolean>;

  /** The actual promote network call — only invoked when content is confirmed
   *  saved on the server. */
  promote: () => Promise<void>;
}

/**
 * Run `promote` only after ensuring the latest edit has been persisted.
 *
 * Returns `null` on success, or a user-facing error string when the save
 * failed and the promote was intentionally blocked.
 */
export async function runPromoteWithSaveGuard(
  opts: PromoteGuardOptions,
): Promise<string | null> {
  const { inFlightSave, isDirty, save, promote } = opts;

  // 1. Wait for any already-started (autosave-timer-fired) save to settle.
  //    This is the core race fix: the timer may have already called save(),
  //    cleared `dirty`, and be mid-fetch — we must not skip past it.
  if (inFlightSave !== null) {
    const ok = await inFlightSave;
    if (!ok) {
      return "Couldn't save your edits — please try again before sending for review.";
    }
  }

  // 2. If the draft is still dirty (a new edit landed while the autosave was
  //    running, or no autosave had started yet), trigger one final save.
  if (isDirty()) {
    const ok = await save();
    if (!ok) {
      return "Couldn't save your edits — please try again before sending for review.";
    }
  }

  // 3. Content is confirmed on the server — safe to promote.
  await promote();
  return null;
}
