import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { loadAccountSnapshot, loadAccountAudit } from "@/lib/admin/account-lookup";
import { diagnoseAccount, REPAIRS } from "@/lib/admin/account-diagnosis";

/**
 * Everything the People surface shows for one account: the raw snapshot, the
 * computed verdict, the repairs that apply, and the audit history.
 *
 * The verdict is computed here rather than in the client so it can never drift
 * from the repairs offered alongside it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await params;
  const snapshot = await loadAccountSnapshot(id);
  const diagnosis = diagnoseAccount(snapshot);
  const audit = await loadAccountAudit(id);

  return NextResponse.json({
    snapshot,
    diagnosis,
    repairSpecs: diagnosis.repairs.map((r) => REPAIRS[r]),
    audit: audit.rows,
    auditError: audit.error,
  });
}
