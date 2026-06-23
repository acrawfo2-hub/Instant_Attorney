import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";
import { runRetentionDestruction } from "@/lib/archive/destruction";

export const maxDuration = 300;

/**
 * Run the end-of-retention lifecycle: send destruction notices for archives past
 * retention_until, then securely destroy those whose notice period has elapsed
 * (honoring legal holds). Auth: attorney session OR `x-cron-secret`.
 */
export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isCron = !!cronSecret && req.headers.get("x-cron-secret") === cronSecret;
  if (!isCron) {
    const attorneyId = await getAttorneyUserId();
    if (!attorneyId) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  const limit = Math.min(200, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 50)));
  const serviceDb = createServiceClient();
  const result = await runRetentionDestruction(serviceDb, limit);

  return NextResponse.json({ ok: true, ...result, skipped: result.skipped || undefined });
}
