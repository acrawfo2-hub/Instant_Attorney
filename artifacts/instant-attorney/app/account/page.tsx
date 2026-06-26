import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID, BYPASS_EMAIL } from "@/lib/types";
import LogoutButton from "@/components/LogoutButton";
import ManageBillingButton from "@/components/ManageBillingButton";
import ProfileEditForm from "@/components/ProfileEditForm";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export const dynamic = "force-dynamic";

interface ProfileRow {
  email: string | null;
  full_name: string | null;
  phone: string | null;
  created_at: string | null;
  is_attorney?: boolean | null;
}
interface SubscriptionRow {
  status: string | null;
  plan: string | null;
  current_period_end: string | null;
  consult_credits: number | null;
  stripe_customer_id: string | null;
}
interface LedgerRow {
  total_topups: number | null;
  total_topup_usd: number | null;
  month_topup_usd: number | null;
  monthly_topup_limit_usd: number | null;
}
interface ChargeRow {
  id: string;
  amount_usd: number | null;
  status: string | null;
  created_at: string | null;
  settled_at: string | null;
}

const usd = (n: number | null | undefined) => `$${(Number(n) || 0).toFixed(2)}`;

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const PLAN_LABEL: Record<string, string> = {
  phase2: "Phase II — Living File ($9.99/mo)",
  consult: "Attorney Consult",
};

const STATUS_LABEL: Record<string, string> = {
  active: "Active",
  trialing: "Trial",
  past_due: "Past due",
  canceled: "Cancelled",
  bypass: "Test mode",
};

async function getData() {
  let userId: string;
  let email: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    email = BYPASS_EMAIL;
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user } } = await db.auth.getUser();
    if (!user) redirect("/login");
    userId = user.id;
    email = user.email ?? "";
  }

  const [{ data: profile }, { data: sub }, { data: ledger }, { data: charges }] = await Promise.all([
    db.from("profiles").select("email, full_name, phone, created_at, is_attorney").eq("id", userId).maybeSingle(),
    db.from("subscriptions").select("status, plan, current_period_end, consult_credits, stripe_customer_id").eq("user_id", userId).maybeSingle(),
    db.from("top_up_ledger").select("total_topups, total_topup_usd, month_topup_usd, monthly_topup_limit_usd").eq("user_id", userId).maybeSingle(),
    db.from("top_up_charges").select("id, amount_usd, status, created_at, settled_at").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
  ]);

  return {
    email: (profile as ProfileRow | null)?.email ?? email,
    profile: profile as ProfileRow | null,
    sub: sub as SubscriptionRow | null,
    ledger: ledger as LedgerRow | null,
    charges: (charges ?? []) as ChargeRow[],
  };
}

export default async function AccountPage() {
  const { email, profile, sub, ledger, charges } = await getData();

  const isAttorney = !!profile?.is_attorney;
  const planLabel = sub?.plan ? (PLAN_LABEL[sub.plan] ?? sub.plan) : "No active plan";
  const statusLabel = sub?.status ? (STATUS_LABEL[sub.status] ?? sub.status) : "—";
  const statusKey = sub?.status ?? "none";
  const consultCredits = sub?.consult_credits ?? 0;
  const hasBilling = !!sub?.stripe_customer_id;

  const succeededCharges = charges.filter((c) => c.status === "succeeded");
  const backHref = isAttorney ? "/attorney" : "/dashboard";

  return (
    <div className="lf-shell">
      <header className="lf-header">
        <Link href="/" className="lf-header-logo">
          <div className="fc-logo-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          Instant-Attorney
        </Link>
        <div className="lf-header-center">
          <span className="lf-header-title">Account</span>
        </div>
        <div className="lf-header-right">
          <Link href={backHref} className="lf-logout-btn">{isAttorney ? "Back to Dashboard" : "Back to Files"}</Link>
          <LogoutButton />
        </div>
      </header>

      <main className="lf-main">
        <div className="acc-page-head">
          <h1 className="acc-page-title">{isAttorney ? "Account" : "Account & billing"}</h1>
          <p className="acc-page-sub">Signed in as <strong>{email}</strong></p>
        </div>

        {/* Profile */}
        <section className="acc-card">
          <div className="acc-card-head">
            <h2 className="acc-card-title">Profile</h2>
            <span className="acc-card-meta">Member since {fmtDate(profile?.created_at)}</span>
          </div>
          <ProfileEditForm
            initialName={profile?.full_name ?? ""}
            initialPhone={profile?.phone ?? ""}
            email={email}
          />
        </section>

        {isAttorney && (
          <section className="acc-card">
            <p className="acc-note" style={{ margin: 0 }}>
              You&apos;re signed in as firm staff. Client billing and payment history don&apos;t apply
              to your account.
            </p>
          </section>
        )}

        {/* Subscription */}
        {!isAttorney && (
        <section className="acc-card">
          <h2 className="acc-card-title">Subscription</h2>
          <dl className="acc-rows">
            <div className="acc-row">
              <dt>Plan</dt>
              <dd>{planLabel}</dd>
            </div>
            <div className="acc-row">
              <dt>Status</dt>
              <dd>
                <span className={`acc-badge acc-badge--${statusKey}`}>{statusLabel}</span>
              </dd>
            </div>
            {sub?.current_period_end && (
              <div className="acc-row">
                <dt>{sub.status === "canceled" ? "Access ends" : "Renews"}</dt>
                <dd>{fmtDate(sub.current_period_end)}</dd>
              </div>
            )}
            {consultCredits > 0 && (
              <div className="acc-row">
                <dt>Consult credits</dt>
                <dd>{consultCredits}</dd>
              </div>
            )}
          </dl>
          <div className="acc-actions">
            {hasBilling ? (
              <ManageBillingButton label="Manage card & view invoices" variant="primary" />
            ) : (
              <Link href="/onboarding" className="acc-btn acc-btn--primary">Set up subscription</Link>
            )}
          </div>
        </section>
        )}

        {/* Pay history */}
        {!isAttorney && (
        <section className="acc-card" id="pay-history">
          <div className="acc-card-head">
            <h2 className="acc-card-title">Payment history</h2>
            {ledger && (ledger.total_topups ?? 0) > 0 && (
              <span className="acc-card-meta">
                {ledger.total_topups} top-up{ledger.total_topups !== 1 ? "s" : ""} · {usd(ledger.total_topup_usd)} lifetime
              </span>
            )}
          </div>

          <p className="acc-note">
            Usage top-up charges are listed below. Your monthly subscription and one-time consult
            payments, plus downloadable receipts and invoices, live in the secure billing portal.
          </p>

          {succeededCharges.length === 0 ? (
            <div className="acc-empty">No usage top-up charges yet.</div>
          ) : (
            <div className="acc-table-wrap">
              <table className="acc-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Description</th>
                    <th className="acc-num">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {succeededCharges.map((c) => (
                    <tr key={c.id}>
                      <td>{fmtDateTime(c.settled_at ?? c.created_at)}</td>
                      <td>AI usage top-up</td>
                      <td className="acc-num">{usd(c.amount_usd)}</td>
                      <td><span className="acc-badge acc-badge--paid">Paid</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {hasBilling && (
            <div className="acc-actions">
              <ManageBillingButton label="View all invoices & receipts" variant="ghost" />
            </div>
          )}
        </section>
        )}

        {!isAttorney && (
        <section className="acc-card">
          <h2 className="acc-card-title">Legal &amp; policies</h2>
          <p className="acc-note">
            Review how we handle your data, billing, and AI-assisted services.
          </p>
          <div className="acc-legal-links">
            <Link href="/legal/terms">Terms of Service</Link>
            <Link href="/legal/privacy">Privacy Policy</Link>
            <Link href="/legal/billing">Billing &amp; Refunds</Link>
            <Link href="/legal/disclaimers">Legal Disclaimers</Link>
            <Link href="/legal/ai-philosophy">AI Philosophy</Link>
          </div>
        </section>
        )}

        <div className="acc-signout-row">
          <LogoutButton />
        </div>
      </main>
    </div>
  );
}
