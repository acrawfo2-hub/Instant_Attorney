import { redirect } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/admin-auth";
import AdminNav from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

/**
 * The admin shell.
 *
 * Gates every /admin page in one place, and deliberately owns its own chrome
 * rather than reusing the app's — the console has to render and stay useful
 * when the product around it is broken, so it depends on as little of the
 * product as possible.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();
  if (!admin) redirect("/login");

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>Admin</span>
          </div>
          <div className="admin-header-right">
            <span className="admin-name">{admin.email ?? admin.userId}</span>
            <Link href="/attorney" className="admin-link">Attorney Dashboard →</Link>
          </div>
        </div>
        <div className="admin-nav-bar">
          <AdminNav />
        </div>
      </header>

      {admin.via !== "profile" && (
        <div className={admin.via === "bypass" ? "admin-alert admin-alert-danger" : "admin-alert"}>
          {admin.via === "break-glass" ? (
            <>
              <strong>Break-glass access.</strong> You are authorised by the{" "}
              <code>ADMIN_EMAILS</code> allowlist, not by <code>profiles.is_attorney</code>. That
              means the normal check did not grant access — worth finding out why. Every action you
              take is recorded as break-glass.
            </>
          ) : (
            <>
              <strong>BYPASS_AUTH is on.</strong> Nobody is authenticated and every action runs as
              the bypass user. This is a development-only mode; admin routes refuse to honour it in
              production.
            </>
          )}
        </div>
      )}

      <main className="admin-main">{children}</main>
    </div>
  );
}
