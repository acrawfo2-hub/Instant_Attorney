import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import ArchiveAdminTable, { type ArchiveRow } from "@/components/ArchiveAdminTable";

export const dynamic = "force-dynamic";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export default async function ArchivesAdminPage() {
  // Attorney gate (mirrors /admin).
  if (!BYPASS_AUTH) {
    const db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) redirect("/login");
    const { data: profile } = await db
      .from("profiles").select("is_attorney").eq("id", user.id).single();
    if (!profile?.is_attorney) redirect("/dashboard");
  } else {
    void BYPASS_USER_ID;
  }

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
