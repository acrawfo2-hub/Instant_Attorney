import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import ArchiveAdminTable, { type ArchiveRow } from "@/components/ArchiveAdminTable";

export const dynamic = "force-dynamic";

export default async function ArchivesAdminPage() {
  // Access is gated by app/admin/layout.tsx, which also honours the break-glass
  // allowlist — re-checking profiles.is_attorney here would defeat it.
  const serviceDb = createServiceClient();
  const { data } = await serviceDb
    .from("matter_archives")
    .select(
      "id, case_file_id, user_email, matter_title, matter_type, file_type, " +
      "document_count, attachment_count, size_bytes, category, legal_hold, " +
      "archived_at, retention_until, destruction_notice_sent_at, destroyed_at"
    )
    .order("archived_at", { ascending: false })
    .limit(100);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Archived matters</h1>
        <Link href="/admin" style={{ fontSize: 13, color: "#2563eb" }}>← Admin</Link>
      </div>
      <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
        Cold-stored client files (encrypted). Retained per the retention policy; destruction is
        notice-first and honors legal holds. Retrieving or destroying produces confidential client
        data — handle accordingly.
      </p>
      <ArchiveAdminTable initial={(data ?? []) as unknown as ArchiveRow[]} />
    </div>
  );
}
