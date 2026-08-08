import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import AttorneySignupAdminTable, { type AttorneySignupRow } from "@/components/AttorneySignupAdminTable";

export const dynamic = "force-dynamic";

export default async function AttorneySignupsAdminPage() {
  // Access is gated by app/admin/layout.tsx, which also honours the break-glass
  // allowlist — re-checking profiles.is_attorney here would defeat it.
  const serviceDb = createServiceClient();
  const { data } = await serviceDb
    .from("profiles")
    .select("id, email, full_name, phone, bar_number, firm_name, attorney_user_status, created_at")
    .eq("account_type", "attorney_user")
    .order("created_at", { ascending: false })
    .limit(200);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 20px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Attorney-user signups</h1>
        <Link href="/admin" style={{ fontSize: 13, color: "#2563eb" }}>← Admin</Link>
      </div>
      <p style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}>
        Attorneys signing up to use Instant Attorney as a drafting tool for their own
        clients' matters. Nothing unlocks (no checkout, no wizards) until you approve —
        verify the bar number/firm before approving.
      </p>
      <AttorneySignupAdminTable initial={(data ?? []) as unknown as AttorneySignupRow[]} />
    </div>
  );
}
