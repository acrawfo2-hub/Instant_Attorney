import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";
import { destroyArchive } from "@/lib/archive/destruction";

/**
 * Attorney-initiated immediate destruction of a single archive (e.g. a verified
 * client deletion request). Requires { confirm: true }. Honors legal holds.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const attorneyId = await getAttorneyUserId();
  if (!attorneyId) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== true) {
    return NextResponse.json({ error: "Destruction requires { confirm: true }" }, { status: 400 });
  }

  const { id } = await params;
  const serviceDb = createServiceClient();
  const result = await destroyArchive(serviceDb, id);

  if (!result.destroyed) {
    return NextResponse.json({ ok: false, reason: result.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true, archiveId: id });
}
