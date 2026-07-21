import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { syncLivingFile } from "@/lib/living-file-extractor";
import { BYPASS_USER_ID } from "@/lib/types";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Forced Living File flush — called when the client leaves or toggles the chat
// (including via navigator.sendBeacon on page hide), so the tail of the
// conversation since the last automatic sweep still lands in the file.
export async function POST(req: NextRequest) {
  let caseFileId: string | undefined;
  try {
    ({ caseFileId } = await req.json() as { caseFileId?: string });
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!caseFileId) {
    return NextResponse.json({ error: "caseFileId required" }, { status: 400 });
  }

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  // Ownership check — RLS also constrains the writes, but fail fast and clearly.
  const { data: caseFile } = await db
    .from("case_files")
    .select("user_id")
    .eq("id", caseFileId)
    .maybeSingle();
  if (!caseFile || caseFile.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const result = await syncLivingFile(anthropic, db, caseFileId, userId, { force: true });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[chat-acp/sync-file] sync error:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}
