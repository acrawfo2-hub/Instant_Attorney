import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processQueuedDocumentJobs } from "@/lib/document-job-worker";

export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const processed = await processQueuedDocumentJobs(createServiceClient(), 3);
  return NextResponse.json({ processed });
}
