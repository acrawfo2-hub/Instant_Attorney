import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { executeRepair } from "@/lib/admin/account-repairs";
import { loadAccountSnapshot } from "@/lib/admin/account-lookup";
import { diagnoseAccount, REPAIRS, type RepairId } from "@/lib/admin/account-diagnosis";

/**
 * Run one repair against one account. POST /api/admin/accounts/[id]/repair
 *
 * Responds with the re-read snapshot and re-computed verdict so the operator
 * sees the actual post-repair state rather than an optimistic UI guess — the
 * point of the page is to know, not to assume.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const repair = body?.repair as RepairId | undefined;

  if (!repair || !REPAIRS[repair]) {
    return NextResponse.json(
      { error: `Provide a repair: ${Object.keys(REPAIRS).join(", ")}` },
      { status: 400 }
    );
  }

  const outcome = await executeRepair(
    { admin, targetUserId: id, origin: new URL(req.url).origin },
    {
      repair,
      reason: typeof body?.reason === "string" ? body.reason : null,
      password: typeof body?.password === "string" ? body.password : null,
      plan: typeof body?.plan === "string" ? body.plan : null,
      status: typeof body?.status === "string" ? body.status : null,
    }
  );

  const snapshot = await loadAccountSnapshot(id);

  return NextResponse.json(
    {
      ...outcome,
      snapshot,
      diagnosis: diagnoseAccount(snapshot),
    },
    { status: outcome.ok ? 200 : 400 }
  );
}
