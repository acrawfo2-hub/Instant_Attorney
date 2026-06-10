import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile } from "@/lib/types";
import CaseFileCard from "@/components/CaseFileCard";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MAX_ACTIVE_FILES = 10;

export const dynamic = "force-dynamic";

async function getData() {
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

  const [{ data: allFiles }, { data: pendingDocs }] = await Promise.all([
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
      .eq("status", "pending_review"),
  ]);

  const files = (allFiles ?? []) as CaseFile[];
  const activeFiles = files.filter((f) => f.status === "open");
  const archivedFiles = files.filter((f) => f.status === "archived");
  const totalPendingDocs = (pendingDocs ?? []).length;

  return { activeFiles, archivedFiles, totalPendingDocs };
}

export default async function DashboardPage() {
  const hdrs = await headers();
  const isBypass = hdrs.get("x-bypass-auth") === "true" || BYPASS_AUTH;

  const { activeFiles, archivedFiles, totalPendingDocs } = await getData();
  const atLimit = activeFiles.length >= MAX_ACTIVE_FILES;

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
          <span className="lf-header-title">Your Files</span>
        </div>
        <div className="lf-header-right">
          {isBypass && <span className="ob-bypass-badge">Test Mode</span>}
        </div>
      </header>

      <main className="lf-main">
        {/* Action buttons — left-aligned row */}
        <div className="dash-toolbar">
          {atLimit ? (
            <span className="dash-limit-note">
              {MAX_ACTIVE_FILES}/{MAX_ACTIVE_FILES} files — archive one to open a new file
            </span>
          ) : (
            <Link href="/chat" className="dash-btn dash-btn-primary">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create New File
            </Link>
          )}
          <Link href="/chat?type=quick_consult" className="dash-btn dash-btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Quick Consult
            <span className="dash-btn-hint">Discuss any legal topic unrelated to your files</span>
          </Link>
          <button className="dash-btn dash-btn-secondary dash-btn--coming-soon" disabled title="Coming soon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            Schedule Consult
            <span className="dash-btn-hint">Book 1-on-1 time with Andrew Crawford, Esq.</span>
          </button>
        </div>

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
            {/* Consult status — one global consult */}
            <div className="dash-status-pill">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>No consult scheduled</span>
            </div>
          </div>
        </div>

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
              Begin an intake to build your Living File with Crawford Law, or use Quick Consult for any privileged one-off question.
            </p>
            <Link href="/chat" className="dash-btn dash-btn-primary dash-btn-lg">
              Begin Intake
            </Link>
          </div>
        ) : (
          <div className="dash-file-grid">
            {activeFiles.map((f) => (
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
