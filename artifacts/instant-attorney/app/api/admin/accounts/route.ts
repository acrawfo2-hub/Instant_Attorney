import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { searchAccounts } from "@/lib/admin/account-lookup";

/** Admin-only account search. GET /api/admin/accounts?q=… */
export async function GET(req: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  if (q.trim().length < 3) {
    return NextResponse.json({ matches: [], warnings: [], hint: "Type at least 3 characters." });
  }

  const { matches, warnings } = await searchAccounts(q);
  return NextResponse.json({ matches, warnings });
}
