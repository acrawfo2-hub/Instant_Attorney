import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CaseFile, FactItem, BYPASS_USER_ID } from "@/lib/types";
import type { Document, ConsultRequest } from "@/lib/types";
import ClientFileView from "@/components/ClientFileView";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function getData(caseFileId: string) {
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

  const [{ data: caseFile }, { data: facts }, { data: documents }, { data: consultRow }, { data: subRow }] = await Promise.all([
    db.from("case_files")
      .select("*")
      .eq("id", caseFileId)
      .eq("user_id", userId)
      .single(),
    db.from("fact_items")
      .select("*")
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: true }),
    db.from("documents")
      .select("*")
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: false }),
    db.from("consult_requests")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "confirmed", "attorney_proposed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("subscriptions")
      .select("status, plan")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (!caseFile) return null;

  const allDocs = (documents ?? []) as Document[];
  const preWarmedByType: Record<string, string> = {};
  for (const doc of allDocs) {
    if (doc.status === "pre_warmed" && !preWarmedByType[doc.doc_type]) {
      preWarmedByType[doc.doc_type] = doc.id;
    }
  }

  return {
    caseFile: caseFile as CaseFile,
    facts: (facts ?? []) as FactItem[],
    documents: allDocs.filter((d) => d.status !== "pre_warmed"),
    preWarmedByType,
    userId,
    consultRequest: (consultRow as ConsultRequest | null) ?? null,
    hasConsultSub: subRow?.plan === "consult" && ["active", "bypass"].includes(subRow?.status ?? ""),
  };
}

export default async function FileDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const hdrs = await headers();
  const isBypass = hdrs.get("x-bypass-auth") === "true" || BYPASS_AUTH;

  const result = await getData(id);
  if (!result) notFound();

  const { caseFile, facts, documents, preWarmedByType, consultRequest, hasConsultSub } = result;

  const title = caseFile.title
    || (caseFile.matter_subtype ? caseFile.matter_subtype.replace(/_/g, " ") : null)
    || "Your File";

  return (
    <div className="lf-shell">
      <header className="lf-header">
        <Link href="/dashboard" className="lf-header-logo">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          All Files
        </Link>

        <div className="lf-header-center">
          <span className="lf-header-title">{title}</span>
          {caseFile.matter_type && (
            <span className="lf-badge">
              {caseFile.matter_type === "reactive" ? "Reactive Matter" : "Preventive Matter"}
            </span>
          )}
        </div>

        <div className="lf-header-right">
          {isBypass && <span className="ob-bypass-badge">Test Mode</span>}
          <Link href={`/chat?caseFileId=${caseFile.id}`} className="lf-begin-btn">
            Continue Intake
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
        </div>
      </header>

      <main className="lf-main">
        <ClientFileView
          caseFile={caseFile}
          facts={facts}
          documents={documents}
          preWarmedByType={preWarmedByType}
          mode="client"
          consultRequest={consultRequest}
          hasConsultSub={hasConsultSub}
        />
      </main>
    </div>
  );
}
