import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { loadMarketingSnapshot, marketingSnapshotCsv } from "@/lib/admin/marketing-analytics";

export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const days = Number(new URL(request.url).searchParams.get("days") ?? 30);
  const snapshot = await loadMarketingSnapshot(Number.isFinite(days) ? days : 30);
  return new NextResponse(marketingSnapshotCsv(snapshot), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="instant-attorney-marketing-${snapshot.generatedAt.slice(0, 10)}.csv"`,
      "cache-control": "no-store",
    },
  });
}
