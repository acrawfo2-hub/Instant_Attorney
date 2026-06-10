import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile } from "@/lib/types";
import CaseFileCard from "@/components/CaseFileCard";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const MAX_ACTIVE_FILES = 10;

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

  const { data: allFiles } = await db
    .from("case_files")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["open", "archived"])
    .order("opened_at", { ascending: false });

  const files = (allFiles ?? []) as CaseFile[];
  const activeFiles = files.filter((f) => f.status === "open");
  const archivedFiles = files.filter((f) => f.status === "archived");

  return { activeFiles, archivedFiles, userId };
}

export default async function DashboardPage() {
  const hdrs = await headers();
  const isBypass = hdrs.get("x-bypass-auth") === "true" || BYPASS_AUTH;

  const { activeFiles, archivedFiles } = await getData();
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
        {/* Intro row */}
        <div className="lf-files-intro">
          <p className="lf-files-intro-text">
            Start a new file, continue where you left off, or ask a quick legal question — all under ACP protection.
          </p>
          <div className="lf-files-intro-actions">
            {atLimit ? (
              <span className="lf-files-limit-note">
                Archive a file to open a new one ({MAX_ACTIVE_FILES}/{MAX_ACTIVE_FILES})
              </span>
            ) : (
              <Link href="/chat" className="lf-begin-btn">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                New File
              </Link>
            )}
            <Link href="/chat?type=quick_consult" className="lf-qc-btn">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
              Quick Consult
              <span className="lf-qc-btn-sub">ACP-protected · any topic</span>
            </Link>
          </div>
        </div>

        {/* Active files */}
        {activeFiles.length === 0 ? (
          <div className="lf-empty">
            <div className="lf-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h2 className="lf-empty-title">No active files yet.</h2>
            <p className="lf-empty-sub">
              Start a new intake file to begin building your Living File with Crawford Law, or use Quick Consult for a one-off privileged question.
            </p>
            <Link href="/chat" className="lf-begin-btn lf-begin-btn-lg">
              Begin Intake →
            </Link>
          </div>
        ) : (
          <div className="lf-files-list">
            {activeFiles.map((f) => (
              <CaseFileCard key={f.id} file={f} mode="active" />
            ))}
          </div>
        )}

        {/* Archived files */}
        {archivedFiles.length > 0 && (
          <div className="lf-files-archive-section">
            <div className="lf-files-section-label">Archive</div>
            <div className="lf-files-list">
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
