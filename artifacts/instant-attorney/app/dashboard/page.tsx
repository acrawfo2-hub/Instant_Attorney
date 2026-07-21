import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID, BYPASS_EMAIL, personDisplayName } from "@/lib/types";
import type { CaseFile, ConsultRequest } from "@/lib/types";
import CaseFileCard from "@/components/CaseFileCard";
import ConsultStatusCard from "@/components/ConsultStatusCard";
import AccountMenu from "@/components/AccountMenu";
import BillingMeter from "@/components/BillingMeter";
import ConsultCheckoutButton from "@/components/ConsultCheckoutButton";
import ResumeMatterBanner from "@/components/ResumeMatterBanner";
import { toMatterSwitcherItem } from "@/lib/matter-switcher";
import { isPrepMode, jurisdictionNotice } from "@/lib/jurisdiction";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MAX_ACTIVE_FILES = 10;

export const dynamic = "force-dynamic";

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

  const [{ data: allFiles }, { data: pendingDocs }, { data: consultRow }, { data: subRow }, { data: profileRow }] = await Promise.all([
    db
      .from("case_files")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["open", "archived"])
      .order("opened_at", { ascending: false }),
    db
      .from("documents")
      .select("case_file_id")
      .eq("user_id", userId)
      .eq("status", "pending_review")
      .is("parent_document_id", null),
    db
      .from("consult_requests")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "confirmed", "attorney_proposed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("subscriptions")
      .select("status, plan, consult_credits")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("profiles")
      .select("full_name, email, account_type, is_attorney, home_state")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  // The reviewing attorney belongs on his review queue, never the client
  // dashboard — bounce before the subscription check even runs (he isn't a
  // paying subscriber). Defense in depth: /login already routes him straight
  // to /attorney, this only matters for a direct nav or a stale bookmark.
  if (!BYPASS_AUTH && profileRow?.is_attorney) {
    redirect("/attorney");
  }

  if (!BYPASS_AUTH && (!subRow || !["active", "trialing", "bypass"].includes(subRow.status ?? ""))) {
    redirect(profileRow?.account_type === "attorney_user" ? "/onboarding/attorney" : "/onboarding");
  }

  const files = (allFiles ?? []) as CaseFile[];
  const activeFiles = files.filter((f) => f.status === "open");
  const archivedFiles = files.filter((f) => f.status === "archived");
  const totalPendingDocs = (pendingDocs ?? []).length;
  const consult = consultRow as ConsultRequest | null;
  const isActiveStatus = ["active", "bypass"].includes(subRow?.status ?? "");
  const hasConsultSub = isActiveStatus && (subRow?.plan === "consult" || (subRow?.consult_credits ?? 0) > 0);

  const accountEmail = profileRow?.email ?? email;
  const accountName = personDisplayName(
    { full_name: profileRow?.full_name, email: accountEmail },
    accountEmail || "Account",
  );

  return { activeFiles, archivedFiles, totalPendingDocs, consult, hasConsultSub, accountName, accountEmail, homeState: profileRow?.home_state ?? null };
}

export default async function DashboardPage() {
  const hdrs = await headers();
  const isBypass = hdrs.get("x-bypass-auth") === "true" || BYPASS_AUTH;

  const { activeFiles, archivedFiles, totalPendingDocs, consult, hasConsultSub, accountName, accountEmail, homeState } = await getData();
  const atLimit = activeFiles.length >= MAX_ACTIVE_FILES;
  const hasFiles = activeFiles.length > 0;
  const prepMode = isPrepMode(homeState);

  // Single open matter → land on the Living File (Mission Control / Next Step),
  // not a chat-forward file list. Chat remains the intake surface from inside the file.
  if (activeFiles.length === 1) {
    redirect(`/dashboard/${activeFiles[0].id}`);
  }

  // Prefer files that already have a next step when showing the multi-file grid.
  const sortedActive = [...activeFiles].sort((a, b) => {
    const aNext = a.next_action ? 0 : 1;
    const bNext = b.next_action ? 0 : 1;
    if (aNext !== bNext) return aNext - bNext;
    return new Date(b.opened_at).getTime() - new Date(a.opened_at).getTime();
  });

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
          <span className="lf-header-title">{hasFiles ? "Your matters" : "Your Files"}</span>
        </div>
        <div className="lf-header-right">
          {isBypass && <span className="ob-bypass-badge">Test Mode</span>}
          <AccountMenu name={accountName} email={accountEmail} />
        </div>
      </header>

      <main className="lf-main">
        {/* Usage / top-up status + spend-limit controls (hidden for free users) */}
        <BillingMeter />

        {/* Start Here — Living File is the product; chat is how you open/continue it */}
        <section className={`dash-start${hasFiles ? " dash-start--compact" : ""}`}>
          {!hasFiles && (
            <div className="dash-start-badge">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="13 17 18 12 13 7" /><polyline points="6 17 11 12 6 7" />
              </svg>
              Start here
            </div>
          )}
          <div className="dash-start-body">
            {!hasFiles ? (
              <>
                <h2 className="dash-start-title">Open your Living File</h2>
                <p className="dash-start-sub">
                  A short conversation builds your file — facts, gaps, strategy, and a clear next step.
                  The chat is intake; <strong>your Living File is the product</strong>.
                </p>
              </>
            ) : (
              <>
                <h2 className="dash-start-title dash-start-title--compact">Pick up where you left off</h2>
                <p className="dash-start-sub dash-start-sub--compact">
                  Open a Living File to see your next step, open gaps, and documents. Chat is available inside each file when you need to add facts.
                </p>
              </>
            )}
            <div className="dash-start-actions">
              {atLimit ? (
                <span className="dash-limit-note">
                  {MAX_ACTIVE_FILES}/{MAX_ACTIVE_FILES} files — archive one to open a new file
                </span>
              ) : (
                <Link href="/chat" className="dash-btn dash-btn-primary dash-btn-lg">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  {hasFiles ? "Open another matter" : "Start Your Living File"}
                </Link>
              )}
              <Link href="/chat?type=quick_consult" className="dash-btn dash-btn-secondary">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                Quick Question
                <span className="dash-btn-hint">A privileged one-off question, unrelated to your files</span>
              </Link>
              {consult && consult.status !== "cancelled" && consult.status !== "completed" ? (
                <a href="#consult-status" className="dash-btn dash-btn-secondary dash-btn--consult-active">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  View Consult
                  <span className="dash-btn-hint">
                    {consult.status === "confirmed" ? "Confirmed — see details below" :
                     consult.status === "attorney_proposed" ? "New time proposed — respond below" :
                     "Pending attorney confirmation"}
                  </span>
                </a>
              ) : hasConsultSub ? (
                <Link href="/consult/schedule" className="dash-btn dash-btn-secondary">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                    <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  Schedule Consult
                  <span className="dash-btn-hint">Book 1-on-1 time with Andrew Crawford, Esq.</span>
                </Link>
              ) : (
                <ConsultCheckoutButton />
              )}
            </div>
          </div>
        </section>

        {/* Self-service tools — optional, collapsed once the client has a file so
            the file's strategy / gaps / next steps stay front and center. */}
        {prepMode && (
          <div className="ob-jurisdiction-banner" role="status" style={{ marginBottom: 16 }}>
            {jurisdictionNotice(homeState)}
            <p className="ob-jurisdiction-banner-sub">
              Texas-specific calculators below are labeled for reference only — they are not
              authoritative for your state. Prefer your Living File Prep handoff.
            </p>
          </div>
        )}
        <details className="dash-toolbox" {...(!hasFiles ? { open: true } : {})}>
          <summary className="dash-toolbox-summary">
            <span className="dash-toolbox-summary-main">
              <svg className="dash-toolbox-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span>Self-service tools</span>
            </span>
            <span className="dash-toolbox-summary-note">
              Optional — free calculators &amp; screeners. You don&apos;t need these to start.
            </span>
            <svg className="dash-toolbox-caret" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </summary>

          <div className="dash-toolbox-grid">
            <Link href="/personal-injury/rights" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Injury Claim Playbook
              <span className="dash-btn-hint">Free — rights, next steps, and insurer traps to avoid</span>
            </Link>
            <Link href="/personal-injury/sol" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              PI Limitations Screener
              <span className="dash-btn-hint">Free — how long do you have to sue in Texas?</span>
            </Link>
            <Link href="/personal-injury/fault" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" />
              </svg>
              Fault Impact Calculator
              <span className="dash-btn-hint">Free — how Texas comparative negligence affects recovery</span>
            </Link>
            <Link href="/debt/rights" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              Debt-Collection Rights
              <span className="dash-btn-hint">Free — your rights and next steps against a debt collector</span>
            </Link>
            <Link href="/tax/guidance" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Tax Problem Navigator
              <span className="dash-btn-hint">Free — IRS notices, audits &amp; levies — legal guidance, not return prep</span>
            </Link>
            <Link href="/bankruptcy/means-test" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6l9-3 9 3M5 10v8m14-8v8M3 21h18M9 10v8m6-8v8" />
              </svg>
              Chapter 7 Means Test
              <span className="dash-btn-hint">Free — can you file Chapter 7? Check the income screen</span>
            </Link>
            <Link href="/bankruptcy/exemptions" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><polyline points="9 12 11 14 15 10" />
              </svg>
              What You&apos;d Keep
              <span className="dash-btn-hint">Free — Texas exemptions: what bankruptcy can&apos;t touch</span>
            </Link>
            <Link href="/bankruptcy/options" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" /><path d="M12 3v3m0 12v3M3 12h3m12 0h3M5.6 5.6l2.1 2.1m8.6 8.6l2.1 2.1m0-12.8l-2.1 2.1M7.7 16.3l-2.1 2.1" />
              </svg>
              Debt-Relief Options
              <span className="dash-btn-hint">Free — weigh bankruptcy vs. the alternatives</span>
            </Link>
            <Link href="/defamation/assess" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              Defamation Check
              <span className="dash-btn-hint">Free — do you have a case? Know the 1-year deadline</span>
            </Link>
            <Link href="/employment/claim-check" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              Employment Claim Check
              <span className="dash-btn-hint">Free — fired or mistreated? Find your claim and deadline</span>
            </Link>
            <Link href="/employment/noncompete" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
              </svg>
              Non-Compete Check
              <span className="dash-btn-hint">Free — how much of a Texas non-compete actually holds up</span>
            </Link>
            <Link href="/family/child-support" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
              Child Support Estimator
              <span className="dash-btn-hint">Free — a Texas guideline child-support estimate in seconds</span>
            </Link>
            <Link href="/family/property-division" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M6 6v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><line x1="12" y1="11" x2="12" y2="16" />
              </svg>
              Property Division Estimator
              <span className="dash-btn-hint">Free — see how a Texas community estate would split</span>
            </Link>
            <Link href="/family/possession-schedule" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              Possession Schedule
              <span className="dash-btn-hint">Free — the Texas Standard Possession Order on a calendar</span>
            </Link>
            <Link href="/family/maintenance" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v18" /><path d="M5 7l7-4 7 4" /><path d="M5 7l-2 6a4 4 0 0 0 8 0L9 7M19 7l-2 6a4 4 0 0 0 8 0l-2-6" />
              </svg>
              Spousal Maintenance Screen
              <span className="dash-btn-hint">Free — an honest read on Texas spousal maintenance</span>
            </Link>
            <Link href="/estate/planner" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 21h18M5 21V9l7-5 7 5v12M9 21v-6h6v6" />
              </svg>
              Estate Planning &amp; Trusts
              <span className="dash-btn-hint">Free — do you actually need a trust? A plain-English read for the middle class</span>
            </Link>
            <Link href="/what-if" className="dash-btn dash-btn-secondary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              What-If Game
              <span className="dash-btn-hint">Optional — pressure-test your strategy against scenarios the law has seen</span>
            </Link>
          </div>

          <p className="dash-toolbox-foot">
            Document review and government-form help live inside each file — start a conversation
            and they&apos;ll appear there when your matter needs them.
          </p>
        </details>

        {/* Global status bar */}
        <div className="dash-status-bar">
          <div className="dash-status-left">
            <span className="dash-status-count">
              {activeFiles.length} of {MAX_ACTIVE_FILES} active file{activeFiles.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="dash-status-right">
            {/* Pending docs across all files */}
            <div className={`dash-status-pill${totalPendingDocs > 0 ? " dash-status-pill--active" : ""}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="12" y2="17"/>
              </svg>
              {totalPendingDocs > 0
                ? <><strong>{totalPendingDocs}</strong> doc{totalPendingDocs !== 1 ? "s" : ""} awaiting 48-hr review</>
                : <>No docs pending review</>
              }
            </div>
            {/* Consult status */}
            <div className={`dash-status-pill${consult?.status === "confirmed" ? " dash-status-pill--active" : ""}`}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {!consult || consult.status === "cancelled" ? (
                <span>No consult scheduled</span>
              ) : consult.status === "confirmed" && consult.confirmed_time ? (
                <span>
                  Consult confirmed ·{" "}
                  <strong>{new Date(consult.confirmed_time).toLocaleString("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}</strong>
                </span>
              ) : consult.status === "attorney_proposed" && consult.attorney_proposed_time ? (
                <span>New time proposed — <a href="#consult-status" className="dash-status-link">respond below</a></span>
              ) : (
                <span>Consult pending attorney confirmation</span>
              )}
            </div>
          </div>
        </div>

        {consult && consult.status !== "cancelled" && consult.status !== "completed" && (
          <ConsultStatusCard consult={consult} />
        )}

        {sortedActive.length >= 2 && (
          <ResumeMatterBanner matters={sortedActive.map(toMatterSwitcherItem)} />
        )}

        {/* Active files */}
        {activeFiles.length === 0 ? (
          <div className="dash-empty">
            <div className="dash-empty-icon">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="12" y1="12" x2="12" y2="18" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className="dash-empty-title">No active files</h2>
            <p className="dash-empty-sub">
              Begin an intake to build your Living File with Crawford Law, or use Quick Question for any privileged one-off question.
            </p>
            <Link href="/chat" className="dash-btn dash-btn-primary dash-btn-lg">
              Begin Intake
            </Link>
          </div>
        ) : (
          <div className="dash-file-grid">
            {sortedActive.map((f) => (
              <CaseFileCard key={f.id} file={f} mode="active" />
            ))}
          </div>
        )}

        {/* Archived files */}
        {archivedFiles.length > 0 && (
          <div className="dash-archive-section">
            <div className="dash-section-header">
              <div className="dash-section-line" />
              <span className="dash-section-label">Archive ({archivedFiles.length})</span>
              <div className="dash-section-line" />
            </div>
            <div className="dash-file-grid">
              {archivedFiles.map((f) => (
                <CaseFileCard key={f.id} file={f} mode="archived" />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
