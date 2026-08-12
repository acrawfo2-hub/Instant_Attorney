import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { runAllChecks, runCheck } from "@/lib/admin/checks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Run the health board. GET /api/admin/health[?id=database.schema]
 *
 * Lives under /api/admin because it is an admin-gated report, not a liveness
 * probe. (It originally sat here to avoid colliding with the Express
 * api-server's `/api/healthz`; that server is gone, but /api/admin is still
 * where this belongs — an unauthenticated caller must not be able to run it.)
 *
 * Always 200 when the caller is an admin — a red board is a successful report,
 * not a failed request, and an HTTP error here would hide the very state the
 * page exists to show.
 */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const ctx = { origin: new URL(req.url).origin };
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const report = await runCheck(id, ctx);
    return NextResponse.json({ overall: report.result.status, checks: [report], ranAt: new Date().toISOString(), durationMs: report.durationMs });
  }

  return NextResponse.json(await runAllChecks(ctx));
}
