import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { personDisplayName } from "@/lib/types";
import type { FinancialItem, SecureRefMeta } from "@/lib/types";
import AccountMenu from "@/components/AccountMenu";
import AttorneyFinancialReview from "@/components/AttorneyFinancialReview";
import AttorneyContextHeader from "@/components/AttorneyContextHeader";

export const dynamic = "force-dynamic";

const ITEM_FIELDS =
  "id, case_file_id, user_id, category, label, acquisition_note, owner, characterization, exempt_status, value_low, value_high, value_basis, valued_as_of, provenance, verification_status, source_attachment_id, phase_collected, privileged, red_flags, needs_attorney_review, status, superseded_by, created_at, updated_at";

export default async function AttorneyFinancialsPage({ params }: { params: Promise<{ caseFileId: string }> }) {
  const { caseFileId } = await params;

  const auth = await createClient();
  const { data: { user } } = await auth.auth.getUser();
  if (!user) redirect("/login");
  const { data: viewer } = await auth.from("profiles").select("is_attorney").eq("id", user.id).single();
  if (!viewer?.is_attorney) redirect("/dashboard");

  const db = createServiceClient();
  const { data: caseFile } = await db.from("case_files").select("id, user_id, title").eq("id", caseFileId).single();
  if (!caseFile) notFound();

  const [{ data: itemRows }, { data: clientProfile }] = await Promise.all([
    db.from("financial_items").select(ITEM_FIELDS).eq("case_file_id", caseFileId).neq("status", "removed").order("created_at", { ascending: true }),
    db.from("profiles").select("full_name, email").eq("id", caseFile.user_id).single(),
  ]);

  const items = (itemRows ?? []) as FinancialItem[];
  let secureRefs: SecureRefMeta[] = [];
  if (items.length > 0) {
    const { data: refRows } = await db
      .from("financial_secure_ref")
      .select("id, financial_item_id, kind, last4, created_at")
      .in("financial_item_id", items.map((i) => i.id));
    secureRefs = (refRows ?? []) as SecureRefMeta[];
  }
  const clientName = personDisplayName(clientProfile, "Client");

  return (
    <div className="lf-shell">
      <AttorneyContextHeader currentArea="file" workspace={{
        caseFileId,
        clientId: caseFile.user_id,
        clientName,
        matter: caseFile.title || "Client file",
      }} />
      <header className="lf-header">
        <Link href={`/attorney/workbench/${caseFileId}`} className="lf-header-logo">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {caseFile.title || "Client file"}
        </Link>
        <div className="lf-header-center">
          <span className="lf-header-title">Financials · {clientName}</span>
        </div>
        <div className="lf-header-right">
          <AccountMenu />
        </div>
      </header>

      <main className="lf-main">
        <AttorneyFinancialReview initialItems={items} secureRefs={secureRefs} />
      </main>
    </div>
  );
}
