/**
 * Health check contract.
 *
 * No imports — this module and `catalog.ts` are loaded by node:test, which
 * cannot resolve the `@/` alias anywhere in a test's import graph. Runners live
 * in sibling modules and are bound to catalog entries by id, which is what lets
 * the metadata stay testable while the runners talk to Supabase and the network.
 */

export type CheckStatus = "ok" | "warn" | "fail" | "skip";

export type CheckGroup = "database" | "integrations" | "runtime" | "config";

export const CHECK_GROUPS: readonly CheckGroup[] = [
  "database",
  "integrations",
  "runtime",
  "config",
];

/** A single piece of evidence behind a result. */
export interface CheckRow {
  label: string;
  value: string;
  /** Render as a problem rather than a neutral fact. */
  bad?: boolean;
}

export interface CheckResult {
  status: CheckStatus;
  /** One line. What is true right now. */
  summary: string;
  /** Optional elaboration — why it matters here, what the evidence means. */
  detail?: string;
  rows?: CheckRow[];
  /** What to do about it. Only meaningful when not ok. */
  fix?: string;
}

export interface CheckMeta {
  /** Stable machine id, `group.name`. Never reuse one for a different check. */
  id: string;
  title: string;
  group: CheckGroup;
  /** What actually breaks when this goes red. Shown under the title. */
  matters: string;
  /** Repo-relative path to the memory file explaining the failure mode. */
  memo?: string;
  /** Abort and report `fail` after this long. Defaults to 8s. */
  timeoutMs?: number;
}

export interface CheckContext {
  /** Origin of the running deployment, used by probes that call back into it. */
  origin: string;
}

export type CheckRunner = (ctx: CheckContext) => Promise<CheckResult>;

export interface CheckReport extends CheckMeta {
  result: CheckResult;
  durationMs: number;
}

export const DEFAULT_CHECK_TIMEOUT_MS = 8000;

/** Worst status across a set, using fail > warn > ok, with skip ignored. */
export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  if (statuses.includes("fail")) return "fail";
  if (statuses.includes("warn")) return "warn";
  if (statuses.some((s) => s === "ok")) return "ok";
  return "skip";
}
