import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";
import { sweepArchivableMatters } from "@/lib/archive/matter-archive";

// Archival builds + uploads + verifies per matter; give it room.
export const maxDuration = 300;

/**
 * Run the daily cold-archival sweep: archive all matters past their archive date
 * (and not on legal hold) to encrypted cold storage, then purge hot rows.
 *
 * Auth: a verified attorney session, OR a scheduled caller presenting
 * `x-cron-secret: $CRON_SECRET`. Wire this to a daily scheduled trigger.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const presented = req.headers.get("x-cron-secret");
  const isCron = !!cronSecret && presented === cronSecret;

  if (!isCron) {
    const attorneyId = await getAttorneyUserId();
    if (!attorneyId) {
      return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
    }
  }

  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50)));
  const serviceDb = createServiceClient();
  const result = await sweepArchivableMatters(serviceDb, limit);

  return NextResponse.json({
    ok: true,
    scanned: result.scanned,
    archived_count: result.archived.length,
    archived: result.archived,
    failures: result.failures,
    skipped: result.skipped || undefined,
  });
}
