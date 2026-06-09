import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CaseFile, FactItem, BYPASS_USER_ID } from "@/lib/types";
import type { Document } from "@/lib/types";
import ClientFileView from "@/components/ClientFileView";

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

  const [{ data: caseFile }, { data: facts }, { data: documents }] = await Promise.all([
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
    db.from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const allDocs = (documents ?? []) as Document[];
  const preWarmedByType: Record<string, string> = {};
  for (const doc of allDocs) {
    if (doc.status === "pre_warmed" && !preWarmedByType[doc.doc_type]) {
      preWarmedByType[doc.doc_type] = doc.id;
    }
  }

  return {
    caseFile: caseFile as CaseFile | null,
    facts: (facts ?? []) as FactItem[],
    documents: allDocs.filter((d) => d.status !== "pre_warmed"),
    preWarmedByType,
    userId,
  };
}

export default async function DashboardPage() {
  const hdrs = await headers();
  const isBypass = hdrs.get("x-bypass-auth") === "true" || BYPASS_AUTH;

  const { caseFile, facts, documents, preWarmedByType } = await getData();

  const isEmpty = !caseFile;

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
          <span className="lf-header-title">Your File</span>
          {caseFile && (
            <span className="lf-badge">
              {caseFile.matter_type === "reactive" ? "Reactive Matter" : caseFile.matter_type === "preventive" ? "Preventive Matter" : ""}
            </span>
          )}
        </div>

        <div className="lf-header-right">
          {isBypass && <span className="ob-bypass-badge">Test Mode</span>}
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
          <div className="lf-empty">
            <div className="lf-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h2 className="lf-empty-title">Your file is ready.</h2>
            <p className="lf-empty-sub">
              Begin your ACP-protected intake interview. As we talk, your goals, facts, and strategy will appear here in your Living File.
            </p>
            <Link href="/chat" className="lf-begin-btn lf-begin-btn-lg">
              Begin Intake &rarr;
            </Link>
          </div>
        ) : (
          <ClientFileView
            caseFile={caseFile}
            facts={facts}
            documents={documents}
            preWarmedByType={preWarmedByType}
            mode="client"
          />
        )}
      </main>
    </div>
  );
}
