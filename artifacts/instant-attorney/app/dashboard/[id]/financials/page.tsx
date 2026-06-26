import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { FinancialItem } from "@/lib/types";
import { detectFinancialArea } from "@/lib/financial-schedules";
import { vaultConfigured } from "@/lib/secure-vault";
import type { SecureRefMeta } from "@/lib/types";
import AccountMenu from "@/components/AccountMenu";
import FinancialPicture from "@/components/FinancialPicture";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export const dynamic = "force-dynamic";

const ITEM_FIELDS =
  "id, case_file_id, user_id, category, label, acquisition_note, owner, characterization, exempt_status, value_low, value_high, value_basis, valued_as_of, provenance, verification_status, source_attachment_id, phase_collected, privileged, red_flags, needs_attorney_review, status, superseded_by, created_at, updated_at";

export default async function FinancialsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) redirect("/login");
    userId = user.id;
  }

  const { data: caseFile } = await db
    .from("case_files")
    .select(
      "id, user_id, title, matter_subtype, representation_scope, partner_role, partner_consented, joint_no_secrets_ack, financial_disclosure_acked_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (!caseFile || caseFile.user_id !== userId) notFound();

  const [{ data: itemRows }, { data: attachmentRows }] = await Promise.all([
    db.from("financial_items").select(ITEM_FIELDS).eq("case_file_id", id).neq("status", "removed").order("created_at", { ascending: true }),
    db.from("attachments").select("id, file_name").eq("case_file_id", id).eq("status", "ready").order("created_at", { ascending: false }),
  ]);

  const items = (itemRows ?? []) as FinancialItem[];
  const attachments = (attachmentRows ?? []) as { id: string; file_name: string }[];

  // Vault metadata (redacted last4 only) — read via service role since the
  // secure-ref table has no client RLS; ownership was verified above.
  let secureRefs: SecureRefMeta[] = [];
  if (items.length > 0) {
    const svc = createServiceClient();
    const { data: refRows } = await svc
      .from("financial_secure_ref")
      .select("id, financial_item_id, kind, last4, created_at")
      .in("financial_item_id", items.map((i) => i.id));
    secureRefs = (refRows ?? []) as SecureRefMeta[];
  }

  const area = detectFinancialArea(caseFile.matter_subtype ?? "");
  const isFamilyLaw = area === "family";
  const backHref = `/dashboard/${id}`;
  const title = caseFile.title || "Your file";

  return (
    <div className="lf-shell">
      <header className="lf-header">
        <Link href={backHref} className="lf-header-logo">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          {title}
        </Link>
        <div className="lf-header-center">
          <span className="lf-header-title">Financial Picture</span>
        </div>
        <div className="lf-header-right">
          <AccountMenu />
        </div>
      </header>

      <main className="lf-main">
        <FinancialPicture
          caseFileId={id}
          initialItems={items}
          disclosureAcked={!!caseFile.financial_disclosure_acked_at}
          context={{
            representation_scope: caseFile.representation_scope ?? "single_client",
            partner_role: caseFile.partner_role ?? "none",
            partner_consented: !!caseFile.partner_consented,
            joint_no_secrets_ack: !!caseFile.joint_no_secrets_ack,
          }}
          isFamilyLaw={isFamilyLaw}
          area={area}
          attachments={attachments}
          secureRefs={secureRefs}
          vaultEnabled={vaultConfigured()}
          backHref={backHref}
        />
      </main>
    </div>
  );
}
