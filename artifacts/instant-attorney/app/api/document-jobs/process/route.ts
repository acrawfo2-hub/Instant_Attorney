import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processQueuedDocumentJobs, runDocumentGenerationJobs } from "@/lib/document-job-worker";

export const maxDuration = 300;

/**
 * Fills queued document-generation jobs. This is a *worker* endpoint, not the
 * retention cron. `scripts/archival-cron.mjs` archives and destroys records; it
 * must not call this route. Day-to-day drafting is kicked from chat-acp (and
 * the drafts-panel status poll) so a daily compliance sweep is never what
 * produces a client's document.
 *
 * POST with `{ jobIds }` runs those jobs. POST without a body drains the
 * oldest high-priority queued rows — a safety net for stranded work, not the
 * primary trigger.
 */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({})) as { jobIds?: unknown };
  const db = createServiceClient();
  if (Array.isArray(body.jobIds) && body.jobIds.every((id) => typeof id === "string")) {
    const processed = await runDocumentGenerationJobs(db, body.jobIds);
    return NextResponse.json({ processed });
  }
  const processed = await processQueuedDocumentJobs(db, 3);
  return NextResponse.json({ processed });
}
