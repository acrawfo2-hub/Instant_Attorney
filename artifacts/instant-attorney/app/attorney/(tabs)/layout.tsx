import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { personDisplayName } from "@/lib/types";
import AccountMenu from "@/components/AccountMenu";
import AttorneyTabNav from "@/components/AttorneyTabNav";

// Persistent shell for the three top-level attorney views (Dashboard, Clients,
// Consults) — a route group so it doesn't wrap the drill-down pages
// (file view, document review, financials, per-client hub), which keep their
// own contextual headers as-is.
export default async function AttorneyTabsLayout({ children }: { children: React.ReactNode }) {
  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await auth.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.is_attorney) redirect("/dashboard");

  const db = createServiceClient();
  const [{ count: draftsCount }, { count: consultsCount }] = await Promise.all([
    db
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending_review")
      .is("parent_document_id", null),
    db
      .from("consult_requests")
      .select("id", { count: "exact", head: true })
      .in("status", ["pending", "attorney_proposed"]),
  ]);

  const drafts = draftsCount ?? 0;
  const consults = consultsCount ?? 0;

  const tabs = [
    { href: "/attorney", label: "Dashboard", badge: drafts + consults },
    { href: "/attorney/clients", label: "Clients" },
    { href: "/attorney/consults", label: "Consults", badge: consults },
  ];

  return (
    <div className="atty-shell">
      <header className="atty-header">
        <div className="atty-header-inner">
          <div className="atty-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Attorney Dashboard</span>
          </div>
          <div className="atty-header-right">
            <AccountMenu name={personDisplayName(profile)} email={profile?.email ?? ""} />
          </div>
        </div>
        <AttorneyTabNav tabs={tabs} />
      </header>

      <main className="atty-main">{children}</main>
    </div>
  );
}
