// ── Legal-data freshness: types, scanner, and report ─────────────────────────
//
// As the app encodes more time-sensitive legal data (statutory dollar caps,
// guideline figures, form revisions, statute text), individual values silently
// go stale — e.g. the Texas child-support net-resources cap drifted for ~10
// months before anyone noticed. This module makes staleness a PROPERTY OF THE
// DATA: every volatile value is registered with provenance (source, when it was
// last human-verified, when it is due for re-check), and a scheduled scan flags
// anything overdue so it becomes a tracked task instead of a matter of memory.
//
// Pure and deterministic — all date math is UTC, no I/O. The registry lives in
// ./registry.ts; the runnable scanner is scripts/check-legal-freshness.ts; the
// scheduled GitHub Action opens/updates a review issue from the report.
//
// IMPORTANT: this tracks WHEN to re-verify; it never auto-changes a legal value.
// Updating the law is always a human, source-checked decision.

export type Volatility =
  /** Auto-adjusted on a published schedule (e.g. the OAG net-resources cap). */
  | "indexed-dollar"
  /** A figure or rule that changes only by legislative amendment. */
  | "statute"
  /** A government form's revision / official URL. */
  | "form"
  /** A whole registry to skim (statutes, form catalog). */
  | "catalog";

export interface FreshnessItem {
  /** Stable identifier. */
  id: string;
  /** Human label for the report. */
  label: string;
  /** Practice area, e.g. "family", "hoa", "forms". */
  area: string;
  volatility: Volatility;
  /** Documentary current value (the code/registry is the source of truth). */
  currentValue: string;
  /** Official source to verify against. */
  sourceUrl: string;
  /** ISO yyyy-mm-dd a human last verified the value against the source. */
  verifiedOn: string;
  /** ISO yyyy-mm-dd after which the value should be re-checked. */
  reviewAfter: string;
  /** ISO date the current value took effect, if known. */
  effectiveDate?: string;
  /** ISO date of a known future change, if scheduled. */
  nextExpectedChange?: string;
  /** Where the value lives in code / any extra context. */
  notes?: string;
}

export interface ScannedItem extends FreshnessItem {
  /** Days until reviewAfter; negative if overdue. */
  daysUntilReview: number;
}

export interface ScanResult {
  /** ISO date the scan was run as of. */
  asOf: string;
  overdue: ScannedItem[];
  dueSoon: ScannedItem[];
  ok: ScannedItem[];
}

const MS_PER_DAY = 86_400_000;

/** Default re-review interval (months) by volatility, used by suggestReviewAfter. */
const DEFAULT_INTERVAL_MONTHS: Record<Volatility, number> = {
  "indexed-dollar": 12,
  statute: 24,
  form: 12,
  catalog: 24,
};

/** Parse a yyyy-mm-dd string into a UTC date, or null if malformed. */
export function parseISODate(s: unknown): Date | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Today's date (UTC) as yyyy-mm-dd. */
export function todayISO(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function addMonths(iso: string, months: number): string {
  const d = parseISODate(iso);
  if (!d) throw new RangeError(`invalid date: ${iso}`);
  // Date.UTC normalizes month overflow into the year.
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, d.getUTCDate())));
}

/**
 * Suggest a reviewAfter date from when a value was verified and how volatile it
 * is, clamped to a known upcoming change. Used when AUTHORING registry entries so
 * cadences stay consistent; the registry stores the resolved date explicitly.
 */
export function suggestReviewAfter(
  verifiedOn: string,
  volatility: Volatility,
  nextExpectedChange?: string
): string {
  const byInterval = addMonths(verifiedOn, DEFAULT_INTERVAL_MONTHS[volatility]);
  if (nextExpectedChange) {
    const a = parseISODate(byInterval);
    const b = parseISODate(nextExpectedChange);
    if (a && b && b.getTime() < a.getTime()) return nextExpectedChange;
  }
  return byInterval;
}

/**
 * Scan a set of freshness items as of a given date. Deterministic.
 * `soonWindowDays` is how far ahead "due soon" reaches (default 60).
 */
export function scanFreshness(
  items: FreshnessItem[],
  asOf: string = todayISO(),
  soonWindowDays = 60
): ScanResult {
  const asOfDate = parseISODate(asOf);
  if (!asOfDate) throw new RangeError(`invalid asOf date: ${asOf}`);

  const overdue: ScannedItem[] = [];
  const dueSoon: ScannedItem[] = [];
  const ok: ScannedItem[] = [];

  for (const item of items) {
    const review = parseISODate(item.reviewAfter);
    // A malformed reviewAfter is treated as overdue (count -Infinity-ish), so a
    // data error surfaces loudly rather than being silently "ok".
    const daysUntilReview = review
      ? Math.floor((review.getTime() - asOfDate.getTime()) / MS_PER_DAY)
      : -1_000_000;
    const scanned: ScannedItem = { ...item, daysUntilReview };
    if (daysUntilReview < 0) overdue.push(scanned);
    else if (daysUntilReview <= soonWindowDays) dueSoon.push(scanned);
    else ok.push(scanned);
  }

  const byReview = (a: ScannedItem, b: ScannedItem) => a.reviewAfter.localeCompare(b.reviewAfter);
  overdue.sort(byReview);
  dueSoon.sort(byReview);
  ok.sort(byReview);

  return { asOf, overdue, dueSoon, ok };
}

function itemLine(it: ScannedItem): string {
  const when =
    it.daysUntilReview < 0
      ? `overdue by ${Math.abs(it.daysUntilReview)} day(s)`
      : `due in ${it.daysUntilReview} day(s)`;
  const next = it.nextExpectedChange ? ` · next change ${it.nextExpectedChange}` : "";
  return `- **${it.label}** (${it.area} · ${it.volatility}) — ${when} (review after ${it.reviewAfter})\n  - current: ${it.currentValue}\n  - verify: ${it.sourceUrl}${next}${it.notes ? `\n  - ${it.notes}` : ""}`;
}

/** Render a markdown report suitable for a GitHub issue body. */
export function formatFreshnessReport(result: ScanResult): string {
  const lines: string[] = [
    "## Legal data freshness",
    "",
    `Scan as of **${result.asOf}**. This is a re-verification reminder — values are not changed automatically. Confirm each against its official source, then bump \`verifiedOn\` / \`reviewAfter\` in \`lib/legal-freshness/registry.ts\`.`,
    "",
    `**${result.overdue.length} overdue · ${result.dueSoon.length} due soon · ${result.ok.length} current**`,
    "",
  ];

  if (result.overdue.length) {
    lines.push("### ⚠️ Overdue — verify now", "");
    lines.push(...result.overdue.map(itemLine), "");
  }
  if (result.dueSoon.length) {
    lines.push("### ⏳ Due soon", "");
    lines.push(...result.dueSoon.map(itemLine), "");
  }
  if (!result.overdue.length && !result.dueSoon.length) {
    lines.push("✅ All tracked legal data is current.", "");
  }

  return lines.join("\n");
}
