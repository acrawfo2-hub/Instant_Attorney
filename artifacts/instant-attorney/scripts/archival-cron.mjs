#!/usr/bin/env node
// Instant-Attorney retention cron.
//
// Drives the matter retention lifecycle by calling the attorney/cron-gated
// endpoints. Point a daily scheduler at this script (e.g. a Replit Scheduled
// Deployment, or any cron running `node scripts/archival-cron.mjs`).
//
// It runs two phases:
//   1. POST /api/admin/archives/run         — cold-archive matters past archive_at
//   2. POST /api/admin/archives/destroy-run — notice + destroy at end of retention
//
// This script is compliance / record-storage only. It does NOT generate
// documents. Drafting is kicked from chat-acp when a plan is dispatched
// (`kickDocumentGenerationJobs`). Do not add `/api/document-jobs/process` here
// — a daily retention sweep must never become the thing that fills a client's
// draft.
//
// Required env:
//   APP_URL       base URL of the deployed app (e.g. https://instant-attorney.com)
//   CRON_SECRET   must match the server's CRON_SECRET (sent as x-cron-secret)

const APP_URL = process.env.APP_URL?.replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET;

if (!APP_URL || !CRON_SECRET) {
  console.error("[archival-cron] APP_URL and CRON_SECRET are required.");
  process.exit(2);
}

async function call(path) {
  const res = await fetch(`${APP_URL}${path}`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body;
}

try {
  const archived = await call("/api/admin/archives/run");
  console.log(
    `[archival-cron] archival: scanned=${archived.scanned} archived=${archived.archived_count}` +
      (archived.failures?.length ? ` failures=${archived.failures.length}` : "") +
      (archived.skipped ? ` skipped=${archived.skipped}` : "")
  );

  const destruction = await call("/api/admin/archives/destroy-run");
  console.log(
    `[archival-cron] retention: notices=${destruction.noticesSent} destroyed=${destruction.destroyed}` +
      (destruction.failures?.length ? ` failures=${destruction.failures.length}` : "")
  );
  process.exit(0);
} catch (err) {
  console.error(`[archival-cron] failed: ${err.message}`);
  process.exit(1);
}
