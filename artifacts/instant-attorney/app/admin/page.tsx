import Link from "next/link";
import { loadAccountOverview, loadRecentAudit } from "@/lib/admin/account-lookup";

export const dynamic = "force-dynamic";

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString();
}

/**
 * Admin overview.
 *
 * Deliberately answers one question — "is there anything I need to deal with?" —
 * rather than showing every number available. Each panel fetches independently
 * and renders its own failure, so one broken read never blanks the page.
 */
export default async function AdminOverviewPage() {
  const [overview, audit] = await Promise.all([loadAccountOverview(), loadRecentAudit()]);

  const missing = overview.missingProfiles.length;

  return (
    <>
      <h1 className="admin-page-title">Overview</h1>
      <p className="admin-intro">
        Account state at a glance. Anything below that is not zero is a worklist, not a
        statistic. Health probes and one-click infrastructure repairs land in the next
        phase — see <code>docs/admin-console-design.md</code>.
      </p>

      {overview.warnings.length > 0 && (
        <div className="admin-alert admin-alert-danger">
          <strong>Some reads failed.</strong> The numbers below are incomplete.
          <ul className="admin-alert-list">
            {overview.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="admin-cards">
        <div className="admin-card">
          <span className="admin-card-num">{overview.authUsers ?? "—"}</span>
          <span className="admin-card-label">Auth users</span>
        </div>
        <div className="admin-card">
          <span className="admin-card-num">{overview.entitled ?? "—"}</span>
          <span className="admin-card-label">Entitled subscriptions</span>
        </div>
        <div className={missing > 0 ? "admin-card admin-card-danger" : "admin-card"}>
          <span className="admin-card-num">{overview.profiles === null ? "—" : missing}</span>
          <span className="admin-card-label">Missing profile rows</span>
        </div>
        <div
          className={
            (overview.pendingAttorneySignups ?? 0) > 0 ? "admin-card admin-card-warn" : "admin-card"
          }
        >
          <span className="admin-card-num">{overview.pendingAttorneySignups ?? "—"}</span>
          <span className="admin-card-label">Attorney signups pending</span>
        </div>
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">
          Accounts with no profile row
          {missing > 0 && <span className="admin-count">{missing}</span>}
        </h2>
        {overview.profiles === null ? (
          <div className="admin-empty">
            Cannot tell — the profiles read failed, so there is nothing to compare auth users
            against.
          </div>
        ) : missing === 0 ? (
          <div className="admin-empty">
            None. Every auth user has a profiles row, which is what the
            <code> on_auth_user_created </code> trigger is supposed to guarantee.
          </div>
        ) : (
          <>
            <p className="admin-note">
              These accounts cannot be granted a subscription — <code>subscriptions.user_id</code>{" "}
              references <code>profiles(id)</code>, so the insert fails with a foreign-key
              violation — and read as a null profile everywhere in the app. Open each one and run
              &ldquo;Create missing profile row&rdquo;.
            </p>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overview.missingProfiles.slice(0, 50).map((m) => (
                  <tr key={m.userId}>
                    <td>{m.email ?? "—"}</td>
                    <td className="admin-td-muted">{m.fullName ?? "—"}</td>
                    <td>
                      <Link href={`/admin/people?id=${m.userId}`} className="admin-link">
                        Open →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>

      <section className="admin-section">
        <h2 className="admin-section-title">Recent admin actions</h2>
        {audit.error ? (
          <div className="admin-empty">
            Audit log unreadable: {audit.error}. If the table does not exist, apply{" "}
            <code>supabase/schema-stage47-admin-console.sql</code> — until then, repairs still run
            but are <strong>not recorded</strong>.
          </div>
        ) : audit.rows.length === 0 ? (
          <div className="admin-empty">No admin actions recorded yet.</div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Action</th>
                <th>Target</th>
                <th>By</th>
                <th>Reason</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {audit.rows.map((r) => (
                <tr key={r.id}>
                  <td className="admin-td-muted">{fmtWhen(r.created_at)}</td>
                  <td className="admin-td-feature">{r.action}</td>
                  <td className="admin-td-muted">{r.target_email ?? "—"}</td>
                  <td className="admin-td-muted">
                    {r.actor_email ?? "—"}
                    {r.actor_via !== "profile" && (
                      <span className="admin-badge admin-badge-danger" style={{ marginLeft: 6 }}>
                        {r.actor_via}
                      </span>
                    )}
                  </td>
                  <td className="admin-td-muted">{r.reason ?? "—"}</td>
                  <td>
                    {r.outcome === "ok" ? (
                      <span className="admin-badge">ok</span>
                    ) : (
                      <span className="admin-badge admin-badge-danger" title={r.error ?? undefined}>
                        failed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
