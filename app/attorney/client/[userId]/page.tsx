import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import type { CaseFile, FactItem, Document, Profile } from "@/lib/types";
import ClientFileView from "@/components/ClientFileView";

export default async function AttorneyClientPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const db = await createClient();

  const { data: { user } } = await db.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await db
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile?.is_attorney) redirect("/dashboard");

  // Load client profile
  const { data: clientProfile } = await db
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();

  if (!clientProfile) notFound();

  // Load client data in parallel
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

  return (
    <div className="lf-shell">
      <header className="lf-header">
        <Link href="/attorney" className="lf-header-logo">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          ← Dashboard
        </Link>

        <div className="lf-header-center">
          <span className="lf-header-title">Client File</span>
          {caseFile?.matter_type && (
            <span className="lf-badge">
              {caseFile.matter_type === "reactive" ? "Reactive Matter" : "Preventive Matter"}
            </span>
          )}
        </div>

        <div className="lf-header-right">
          <span className="lf-atty-viewing-as">
            {profile.full_name ?? profile.email}
          </span>
        </div>
      </header>

      <main className="lf-main">
        {!caseFile ? (
          <div className="lf-empty">
            <div className="lf-empty-icon">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </div>
            <h2 className="lf-empty-title">No open case file.</h2>
            <p className="lf-empty-sub">
              {clientProfile.full_name ?? clientProfile.email} has not started their intake yet.
            </p>
          </div>
        ) : (
          <ClientFileView
            caseFile={caseFile as CaseFile}
            facts={(facts ?? []) as FactItem[]}
            documents={allDocs.filter((d) => d.status !== "pre_warmed")}
            preWarmedByType={{}}
            mode="attorney"
            clientProfile={clientProfile as Profile}
          />
        )}
      </main>
    </div>
  );
}
