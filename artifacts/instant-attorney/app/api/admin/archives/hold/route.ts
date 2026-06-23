import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";

/**
 * Attorney-only legal hold. A hold blocks automatic archival of a live matter
 * and automatic end-of-retention destruction of an archive (e.g. for a pending
 * dispute, claim, or litigation hold).
 *
 * Body: { caseFileId?: string, archiveId?: string, hold: boolean }
 */
export async function POST(req: NextRequest) {
  const attorneyId = await getAttorneyUserId();
  if (!attorneyId) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const hold = body?.hold === true;
  const caseFileId = typeof body?.caseFileId === "string" ? body.caseFileId : null;
  const archiveId = typeof body?.archiveId === "string" ? body.archiveId : null;

  if (!caseFileId && !archiveId) {
    return NextResponse.json({ error: "Provide caseFileId or archiveId" }, { status: 400 });
  }

  const serviceDb = createServiceClient();
  const updated: Record<string, boolean> = {};

  if (caseFileId) {
    const { error } = await serviceDb
      .from("case_files").update({ legal_hold: hold }).eq("id", caseFileId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated.case_file = true;
  }
  if (archiveId) {
    const { error } = await serviceDb
      .from("matter_archives").update({ legal_hold: hold }).eq("id", archiveId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    updated.archive = true;
  }

  return NextResponse.json({ ok: true, hold, updated });
}
