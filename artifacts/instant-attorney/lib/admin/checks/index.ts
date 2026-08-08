import { CHECK_CATALOG } from "./catalog.ts";
import { RUNNERS } from "./runners.ts";
import {
  DEFAULT_CHECK_TIMEOUT_MS,
  worstStatus,
  type CheckContext,
  type CheckReport,
  type CheckResult,
  type CheckStatus,
} from "./types.ts";

/**
 * The registry: binds catalog metadata to runners and executes them.
 *
 * Three properties the Health page depends on:
 *   * A check that throws becomes a `fail` row, never an exception that blanks
 *     the board. The console has to work when things are broken.
 *   * A check that hangs is cut off at its own timeout, so one dead integration
 *     cannot hold the page.
 *   * A catalog entry with no runner reports itself. Registration drift is a
 *     visible failure rather than a silently absent row.
 */

export { CHECK_CATALOG } from "./catalog.ts";
export type { CheckReport, CheckResult, CheckStatus } from "./types.ts";

function timeoutResult(ms: number): CheckResult {
  return {
    status: "fail",
    summary: `Timed out after ${Math.round(ms / 1000)}s.`,
    detail: "The check could not answer in time — treat the thing it probes as unhealthy.",
  };
}

async function withTimeout(promise: Promise<CheckResult>, ms: number): Promise<CheckResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<CheckResult>((resolve) => {
    timer = setTimeout(() => resolve(timeoutResult(ms)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Run one catalog entry by id. Never throws. */
export async function runCheck(id: string, ctx: CheckContext): Promise<CheckReport> {
  const meta = CHECK_CATALOG.find((c) => c.id === id);
  if (!meta) {
    return {
      id,
      title: id,
      group: "config",
      matters: "",
      result: { status: "fail", summary: `No check registered with id '${id}'.` },
      durationMs: 0,
    };
  }

  const runner = RUNNERS[id];
  const startedAt = Date.now();

  if (!runner) {
    return {
      ...meta,
      result: {
        status: "fail",
        summary: "No runner is bound to this check.",
        detail: "The catalog lists it but lib/admin/checks/runners.ts has no implementation.",
        fix: `Add a '${id}' entry to RUNNERS.`,
      },
      durationMs: 0,
    };
  }

  let result: CheckResult;
  try {
    result = await withTimeout(runner(ctx), meta.timeoutMs ?? DEFAULT_CHECK_TIMEOUT_MS);
  } catch (e) {
    const message = e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
    result = {
      status: "fail",
      summary: `The check itself threw: ${message}`,
      detail: "This is a bug in the probe, not necessarily in the thing it probes.",
    };
  }

  return { ...meta, result, durationMs: Date.now() - startedAt };
}

export interface HealthReport {
  overall: CheckStatus;
  checks: CheckReport[];
  ranAt: string;
  durationMs: number;
}

/** Run the whole board in parallel. Never throws. */
export async function runAllChecks(ctx: CheckContext): Promise<HealthReport> {
  const startedAt = Date.now();
  const checks = await Promise.all(CHECK_CATALOG.map((c) => runCheck(c.id, ctx)));
  return {
    overall: worstStatus(checks.map((c) => c.result.status)),
    checks,
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
  };
}
