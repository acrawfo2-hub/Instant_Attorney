import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CaseFile, FactItem, BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

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

  const [{ data: caseFile }, { data: facts }] = await Promise.all([
    db.from("case_files")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("fact_items")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
  ]);

  return {
    caseFile: caseFile as CaseFile | null,
    facts: (facts ?? []) as FactItem[],
    userId,
  };
}

function MatterBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const label = type === "reactive" ? "Reactive Matter" : "Preventive Matter";
  return <span className="lf-badge">{label}</span>;
}

export default async function DashboardPage() {
  const hdrs = await headers();
  const isBypass = hdrs.get("x-bypass-auth") === "true" || BYPASS_AUTH;

  const { caseFile, facts } = await getData();

  const confirmed = facts.filter((f) => f.status === "confirmed");
  const gaps = facts.filter((f) => f.status === "gap");

  const isEmpty = !caseFile;

  return (
    <div className="lf-shell">
      {/* Header */}
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
          <span className="lf-header-title">Your File</span>
          {caseFile && <MatterBadge type={caseFile.matter_type} />}
        </div>

        <div className="lf-header-right">
          {isBypass && (
            <span className="ob-bypass-badge">Test Mode</span>
          )}
          <Link href="/chat" className="lf-begin-btn">
            {isEmpty ? "Begin Intake" : "Continue Intake"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="lf-main">
        {isEmpty ? (
          /* Empty state */
          <div className="lf-empty">
            <div className="lf-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h2 className="lf-empty-title">Your file is ready.</h2>
            <p className="lf-empty-sub">
              Begin your ACP-protected intake interview. As we talk, your goals, facts, and next actions will appear here in your Living File.
            </p>
            <Link href="/chat" className="lf-begin-btn lf-begin-btn-lg">
              Begin Intake &rarr;
            </Link>
          </div>
        ) : (
          /* Living File */
          <div className="lf-grid">

            {/* Row 1: Matter info + Next action */}
            <div className="lf-card lf-card-sm">
              <div className="lf-card-label">Matter</div>
              <div className="lf-card-value">
                {caseFile.matter_subtype
                  ? caseFile.matter_subtype.replace(/_/g, " ")
                  : "Intake in progress"}
              </div>
              <div className="lf-card-meta">
                Opened {new Date(caseFile.opened_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </div>
            </div>

            <div className="lf-card lf-card-sm lf-card-action">
              <div className="lf-card-label">Next Action</div>
              <div className="lf-card-value lf-next-action">
                {caseFile.next_action ?? "Continue intake to determine"}
              </div>
            </div>

            {/* Goals */}
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Your Goals</div>
              {caseFile.goals && caseFile.goals.length > 0 ? (
                <ul className="lf-list">
                  {(caseFile.goals as string[]).map((g, i) => (
                    <li key={i}>{g}</li>
                  ))}
                </ul>
              ) : (
                <p className="lf-empty-field">Goals will appear as they are identified in your intake chat.</p>
              )}
            </div>

            {/* Confirmed facts + Gaps side by side */}
            <div className="lf-card lf-card-half">
              <div className="lf-card-label">
                Confirmed Facts
                {confirmed.length > 0 && <span className="lf-count">{confirmed.length}</span>}
              </div>
              {confirmed.length > 0 ? (
                <ul className="lf-list lf-list-confirmed">
                  {confirmed.map((f) => <li key={f.id}>{f.description}</li>)}
                </ul>
              ) : (
                <p className="lf-empty-field">Facts confirmed during intake will appear here.</p>
              )}
            </div>

            <div className="lf-card lf-card-half">
              <div className="lf-card-label">
                Open Fact Gaps
                {gaps.length > 0 && <span className="lf-count lf-count-gap">{gaps.length}</span>}
              </div>
              {gaps.length > 0 ? (
                <ul className="lf-list lf-list-gap">
                  {gaps.map((f) => <li key={f.id}>{f.description}</li>)}
                </ul>
              ) : (
                <p className="lf-empty-field">Missing facts to track down will appear here.</p>
              )}
            </div>

            {/* Attorney assessment */}
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Attorney Assessment</div>
              {caseFile.attorney_assessment ? (
                <p className="lf-assessment">{caseFile.attorney_assessment}</p>
              ) : (
                <p className="lf-empty-field">Crawford Law will add an assessment once your intake is complete.</p>
              )}
            </div>

            {/* Documents */}
            <div className="lf-card lf-card-full">
              <div className="lf-card-label">Documents</div>
              <p className="lf-empty-field">
                Documents generated during intake will appear here as downloadable files once attorney-reviewed.
              </p>
            </div>

          </div>
        )}
      </main>
    </div>
  );
}
