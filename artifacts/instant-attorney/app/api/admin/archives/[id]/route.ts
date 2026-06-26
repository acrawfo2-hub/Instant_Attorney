import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";
import { retrieveMatter } from "@/lib/archive/matter-archive";

export const maxDuration = 120;

/**
 * Attorney-only retrieval of an archived matter.
 *   GET .../[id]            → manifest metadata only
 *   GET .../[id]?download=1 → decrypted, integrity-verified matter bundle (JSON,
 *                             attachments embedded as base64) for production to
 *                             the client or in response to legal process.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const attorneyId = await getAttorneyUserId();
  if (!attorneyId) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { id } = await params;
  const serviceDb = createServiceClient();

  if (req.nextUrl.searchParams.get("download") !== "1") {
    const { data } = await serviceDb.from("matter_archives").select("*").eq("id", id).single();
    if (!data) return NextResponse.json({ error: "Archive not found" }, { status: 404 });
    return NextResponse.json({ manifest: data });
  }

  try {
    const { manifest, bundle } = await retrieveMatter(serviceDb, id);
    return new NextResponse(JSON.stringify({ manifest, bundle }, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="matter-${id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
