import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { triggerPreWarm } from "@/lib/pre-warm";
import { BYPASS_USER_ID } from "@/lib/types";
import type { WizardType } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { caseFileId, wizardType, userId: bodyUserId } = await req.json();

  if (!caseFileId || !wizardType) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  // This route can be called internally (with userId in body) or by an auth'd client
  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = bodyUserId ?? BYPASS_USER_ID;
  } else if (bodyUserId) {
    // Internal call from another server route — use service client
    userId = bodyUserId;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  // Run pre-warm in background — return immediately, don't await
  triggerPreWarm(db, caseFileId, userId, wizardType as WizardType).catch((err) =>
    console.error("[pre-warm route] error:", err)
  );

  return NextResponse.json({ queued: true });
}
