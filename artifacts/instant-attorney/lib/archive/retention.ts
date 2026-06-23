/**
 * Retention-period rules for archived matters.
 *
 * Defaults follow legal/07-document-retention-and-destruction-policy.md:
 * a 5-year default, with longer/indefinite retention for certain categories.
 * Periods are intentionally easy to tune (env + this table) because the exact
 * numbers are pending final attorney sign-off.
 */

import type { Document } from "@/lib/types";

export type RetentionCategory = "standard" | "estate_planning" | "minor" | "real_property";

function defaultYears(): number {
  const raw = process.env.ARCHIVE_RETENTION_YEARS;
  const n = raw ? Number(raw) : 5;
  return Number.isFinite(n) && n > 0 ? n : 5;
}

/**
 * Retention years per category. `null` means indefinite (never auto-destroy) —
 * e.g. estate-planning instruments and originals of intrinsic value, which the
 * policy says to return to the client or retain indefinitely.
 */
function yearsForCategory(category: RetentionCategory): number | null {
  switch (category) {
    case "estate_planning":
      return null; // indefinite — never auto-destroy
    case "minor":
      // Until majority + limitations; we cannot compute majority from the file,
      // so hold indefinitely and surface for manual review.
      return null;
    case "real_property":
      return Math.max(defaultYears(), 10);
    case "standard":
    default:
      return defaultYears();
  }
}

/** Infer a retention category from the matter's documents. Conservative. */
export function inferRetentionCategory(documents: Pick<Document, "doc_type">[]): RetentionCategory {
  if (documents.some((d) => d.doc_type === "wills_trusts")) return "estate_planning";
  if (documents.some((d) => d.doc_type === "draft_contract")) return "real_property";
  return "standard";
}

/**
 * Compute the earliest date an archive may be destroyed. Returns null for
 * indefinite-retention categories.
 */
export function computeRetentionUntil(category: RetentionCategory, archivedAt: Date): string | null {
  const years = yearsForCategory(category);
  if (years === null) return null;
  const until = new Date(archivedAt);
  until.setUTCFullYear(until.getUTCFullYear() + years);
  return until.toISOString();
}
