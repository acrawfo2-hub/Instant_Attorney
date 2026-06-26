// Legal-data freshness checker.
//
// Runs the freshness scan over lib/legal-freshness/registry.ts and writes a
// markdown report. Used by the `legal-freshness` GitHub Action (scheduled
// monthly) to open/update a review issue, and runnable locally:
//
//   node scripts/check-legal-freshness.ts            # report to stdout + file
//   node scripts/check-legal-freshness.ts --strict   # exit 1 if anything overdue
//
// AI-free and deterministic. It NEVER changes a legal value — it only reminds a
// human to re-verify against the official source.

import { writeFileSync, appendFileSync } from "node:fs";
import { LEGAL_FRESHNESS_ITEMS } from "../lib/legal-freshness/registry.ts";
import { scanFreshness, formatFreshnessReport, todayISO } from "../lib/legal-freshness/scan.ts";

const strict = process.argv.includes("--strict");
const asOf = todayISO();
const result = scanFreshness(LEGAL_FRESHNESS_ITEMS, asOf);
const report = formatFreshnessReport(result);

// Write the markdown report for the Action to read as an issue body.
const reportPath = "freshness-report.md";
writeFileSync(reportPath, report, "utf8");

// Human summary to stdout.
console.log(report);
console.log(
  `\n[freshness] as of ${asOf}: ${result.overdue.length} overdue, ${result.dueSoon.length} due soon, ${result.ok.length} current.`
);

// Expose counts to the workflow (so it can decide whether to open an issue).
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `overdue=${result.overdue.length}\ndue_soon=${result.dueSoon.length}\n`
  );
}

// Default exit 0 (report mode). --strict makes overdue a failure, for anyone who
// wants to gate a job on it; the scheduled issue-opener does not use --strict.
if (strict && result.overdue.length > 0) {
  process.exitCode = 1;
}
