import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import AttorneySignupAdminTable, { type AttorneySignupRow } from "@/components/AttorneySignupAdminTable";

export const dynamic = "force-dynamic";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export default async function AttorneySignupsAdminPage() {
  // Attorney gate (mirrors /admin and /admin/archives).
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
