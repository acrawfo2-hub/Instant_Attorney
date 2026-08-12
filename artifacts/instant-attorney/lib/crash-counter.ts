/**
 * Counters for the process-level safety nets in `instrumentation.ts`.
 *
 * The crash guard deliberately logs and keeps the server alive rather than
 * exiting, which is right for a single-instance deployment — but it also means
 * real breakage can pile up with nobody reading the logs. Counting the events
 * makes them visible on the Health board instead.
 *
 * Kept in its own module, with no imports, so `instrumentation.ts` can pull it
 * in during boot without dragging anything else into the startup path. State
 * hangs off globalThis so dev-mode module reloads don't reset the tally.
 */

export interface CrashEvent {
  kind: "unhandledRejection" | "uncaughtException";
  at: number;
  message: string;
}

/** Most recent events retained for display. Older ones only affect the counts. */
const MAX_RETAINED = 20;

interface CrashState {
  unhandledRejections: number;
  uncaughtExceptions: number;
  recent: CrashEvent[];
  bootedAt: number;
}

const g = globalThis as unknown as { __crashCounter?: CrashState };

const state: CrashState = g.__crashCounter ?? {
  unhandledRejections: 0,
  uncaughtExceptions: 0,
  recent: [],
  bootedAt: Date.now(),
};
g.__crashCounter = state;

export function recordCrashEvent(kind: CrashEvent["kind"], reason: unknown): void {
  if (kind === "unhandledRejection") state.unhandledRejections++;
  else state.uncaughtExceptions++;

  let message: string;
  try {
    message =
      reason instanceof Error
        ? `${reason.name}: ${reason.message}`
        : String(reason).slice(0, 500);
  } catch {
    message = "(unrepresentable)";
  }

  state.recent.push({ kind, at: Date.now(), message });
  if (state.recent.length > MAX_RETAINED) state.recent.shift();
}

export interface CrashSummary {
  unhandledRejections: number;
  uncaughtExceptions: number;
  recent: CrashEvent[];
  /** When this process started — the window the counts cover. */
  bootedAt: number;
}

export function crashSummary(): CrashSummary {
  return {
    unhandledRejections: state.unhandledRejections,
    uncaughtExceptions: state.uncaughtExceptions,
    recent: [...state.recent].reverse(),
    bootedAt: state.bootedAt,
  };
}
