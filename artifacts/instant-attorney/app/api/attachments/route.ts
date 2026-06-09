import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function GET(req: NextRequest) {
  let userId: string;
  let isAttorney = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    isAttorney = true;
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;

    const { data: profile } = await db
      .from("profiles")
      .select("is_attorney")
      .eq("id", userId)
      .single();
    isAttorney = profile?.is_attorney ?? false;
  }

  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  // Attorneys can see all attachments for any case file; clients see only their own
  const attQ = db
    .from("attachments")
    .select("*")
    .eq("case_file_id", caseFileId)
    .order("created_at", { ascending: false });
  const reqQ = db
    .from("requested_attachments")
    .select("*")
    .eq("case_file_id", caseFileId)
    .order("created_at", { ascending: true });

  if (!isAttorney) {
    attQ.eq("user_id", userId);
    reqQ.eq("user_id", userId);
  }

  const [{ data: attachments }, { data: requested }] = await Promise.all([attQ, reqQ]);

  return NextResponse.json({
    attachments: attachments ?? [],
    requestedAttachments: requested ?? [],
  });
}
