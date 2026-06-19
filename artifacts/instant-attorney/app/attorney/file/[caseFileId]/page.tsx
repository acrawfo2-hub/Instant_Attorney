import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import ClientFileView from "@/components/ClientFileView";
import type { CaseFile, FactItem, Document, Profile } from "@/lib/types";

// Attorney view of a single client case file. Renders the exact same Living
// File the client sees (legal strategy, instruments, fact cards, gov forms,
// documents, attachments + downloads) via ClientFileView in attorney mode.
//
// Reads use the service client AFTER verifying is_attorney with the real
// session, so the attorney sees the full file regardless of per-table RLS
// coverage. The interactive sub-panels (AttachmentPanel, GovFormInstruments)
// fetch through their own attorney-aware API routes.
export default async function AttorneyFilePage({
  params,
}: {
  params: Promise<{ caseFileId: string }>;
}) {
  const { caseFileId } = await params;

  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const { data: viewer } = await auth
    .from("profiles")
    .select("is_attorney")
    .eq("id", user.id)
    .single();
  if (!viewer?.is_attorney) redirect("/dashboard");

  const db = createServiceClient();

  const { data: caseFileRow } = await db
    .from("case_files")
    .select("*")
    .eq("id", caseFileId)
    .single();
  if (!caseFileRow) notFound();
  const caseFile = caseFileRow as CaseFile;

  const [{ data: clientProfile }, { data: facts }, { data: documents }] =
    await Promise.all([
      db.from("profiles").select("*").eq("id", caseFile.user_id).single(),
      db
        .from("fact_items")
        .select("*")
        .eq("case_file_id", caseFileId)
        .order("created_at", { ascending: true }),
      db
        .from("documents")
        .select("*")
        .eq("case_file_id", caseFileId)
        .order("created_at", { ascending: false }),
    ]);

  const allDocs = (documents ?? []) as Document[];
  const topDocuments = allDocs.filter(
    (d) => d.status !== "pre_warmed" && !d.parent_document_id,
  );
  const childDocuments = allDocs.filter((d) => !!d.parent_document_id);

  const client = (clientProfile as Profile | null) ?? undefined;
  const title =
    caseFile.title ||
    (caseFile.matter_subtype ? caseFile.matter_subtype.replace(/_/g, " ") : null) ||
    "Client File";

  return (
    <div className="lf-shell">
      <header className="lf-header">
        <Link href={`/attorney/client/${caseFile.user_id}`} className="lf-header-logo">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back to client
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
          <Link href="/attorney" className="lf-begin-btn">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="lf-main">
        <ClientFileView
          caseFile={caseFile}
          facts={(facts ?? []) as FactItem[]}
          documents={topDocuments}
          childDocuments={childDocuments}
          mode="attorney"
          clientProfile={client}
        />
      </main>
    </div>
  );
}
