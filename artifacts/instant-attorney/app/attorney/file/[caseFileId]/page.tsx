import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import ClientFileView from "@/components/ClientFileView";
import CaseBrainstormChat from "@/components/CaseBrainstormChat";
import AccountMenu from "@/components/AccountMenu";
import type {
  CaseFile,
  FactItem,
  Document,
  Profile,
  RequestedAttachment,
  GovFormInstrument,
  ConsultRequest,
  CaseBrainstormMessage,
} from "@/lib/types";

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
  searchParams,
}: {
  params: Promise<{ caseFileId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { caseFileId } = await params;
  const { view } = await searchParams;
  const isBrainstorm = view === "brainstorm";

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

  const [{ data: clientProfile }, { data: facts }, { data: documents }, { data: requestedRows }, { data: formRows }, { data: consultRow }] =
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
      db
        .from("requested_attachments")
        .select("*")
        .eq("case_file_id", caseFileId)
        .order("created_at", { ascending: true }),
      db
        .from("form_instruments")
        .select("*")
        .eq("case_file_id", caseFileId)
        .neq("status", "dismissed")
        .order("created_at", { ascending: true }),
      db
        .from("consult_requests")
        .select("*")
        .eq("case_file_id", caseFileId)
        .in("status", ["confirmed", "completed"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const consult = (consultRow as ConsultRequest | null) ?? null;

  let brainstormMessages: CaseBrainstormMessage[] = [];
  if (isBrainstorm) {
    const { data: messageRows } = await db
      .from("case_brainstorm_messages")
      .select("*")
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: true });
    brainstormMessages = (messageRows ?? []) as CaseBrainstormMessage[];
  }

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
          {consult && (
            <Link href={`/consult/${consult.id}/session`} className="lf-logout-btn">
              {consult.status === "completed" ? "Consult Session" : "Join Consult"}
            </Link>
          )}
          <Link href={`/attorney/file/${caseFileId}/financials`} className="lf-logout-btn">
            Financials
          </Link>
          <Link href="/attorney" className="lf-begin-btn">
            Dashboard
          </Link>
          <AccountMenu />
        </div>
      </header>

      <nav className="lf-view-tabs">
        <Link href={`/attorney/file/${caseFileId}`} className={`lf-view-tab${!isBrainstorm ? " lf-view-tab-active" : ""}`}>
          Living File
        </Link>
        <Link
          href={`/attorney/file/${caseFileId}?view=brainstorm`}
          className={`lf-view-tab${isBrainstorm ? " lf-view-tab-active" : ""}`}
        >
          Brainstorm
        </Link>
      </nav>

      <main className="lf-main">
        {isBrainstorm ? (
          <div className="lf-grid">
            <div className="lf-card lf-card-full">
              <CaseBrainstormChat caseFileId={caseFileId} initialMessages={brainstormMessages} />
            </div>
          </div>
        ) : (
          <ClientFileView
            caseFile={caseFile}
            facts={(facts ?? []) as FactItem[]}
            documents={topDocuments}
            childDocuments={childDocuments}
            requestedAttachments={(requestedRows ?? []) as RequestedAttachment[]}
            govForms={(formRows ?? []) as GovFormInstrument[]}
            mode="attorney"
            clientProfile={client}
          />
        )}
      </main>
    </div>
  );
}
