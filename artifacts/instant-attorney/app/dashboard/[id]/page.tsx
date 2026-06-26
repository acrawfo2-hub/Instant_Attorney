import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { parseRoadmapOverlay } from "@/lib/roadmap-snapshot";
import { CaseFile, FactItem, BYPASS_USER_ID, personDisplayName } from "@/lib/types";
import type { Document, ConsultRequest, ConsultWrapUp, RequestedAttachment, GovFormInstrument, Attachment } from "@/lib/types";
import { normalizeWrapUp } from "@/lib/consult-wrap-up";
import ClientFileView from "@/components/ClientFileView";
import AccountMenu from "@/components/AccountMenu";
import {
  CASE_FILE_DETAIL_COLUMNS,
  FACT_ITEM_COLUMNS,
  DOCUMENT_LIST_COLUMNS,
  ATTACHMENT_STATUS_COLUMNS,
  REQUESTED_ATTACHMENT_COLUMNS,
  FORM_INSTRUMENT_COLUMNS,
} from "@/lib/file-detail-selects";
import type { RoadmapAiOverlay } from "@/lib/roadmap-types";

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

  const [{ data: caseFile }, { data: facts }, { data: documents }, { data: consultRow }, { data: completedConsultRow }, { data: subRow }, { data: requestedRows }, { data: formRows }, { data: attachmentRows }, { data: roadmapSnap }, { data: profileRow }] = await Promise.all([
    db.from("case_files")
      .select(CASE_FILE_DETAIL_COLUMNS)
      .eq("id", caseFileId)
      .eq("user_id", userId)
      .single(),
    db.from("fact_items")
      .select(FACT_ITEM_COLUMNS)
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: true }),
    db.from("documents")
      .select(DOCUMENT_LIST_COLUMNS)
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: false }),
    db.from("consult_requests")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["pending", "confirmed", "attorney_proposed"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db.from("consult_requests")
      .select("*")
      .eq("user_id", userId)
      .eq("case_file_id", caseFileId)
      .eq("status", "completed")
      .not("post_consult_plan", "is", null)
      .order("wrap_up_submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("subscriptions")
      .select("status, plan")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("requested_attachments")
      .select(REQUESTED_ATTACHMENT_COLUMNS)
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: true }),
    db
      .from("form_instruments")
      .select(FORM_INSTRUMENT_COLUMNS)
      .eq("case_file_id", caseFileId)
      .neq("status", "dismissed")
      .order("created_at", { ascending: true }),
    db
      .from("attachments")
      .select(ATTACHMENT_STATUS_COLUMNS)
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: true }),
    db
      .from("roadmap_snapshots")
      .select("ai_overlay")
      .eq("case_file_id", caseFileId)
      .maybeSingle(),
    db
      .from("profiles")
      .select("full_name, email")
      .eq("id", userId)
      .maybeSingle(),
  ]);

  if (!BYPASS_AUTH && (!subRow || !["active", "trialing", "bypass"].includes(subRow?.status ?? ""))) {
    redirect("/onboarding");
  }

  if (!caseFile) return null;

  const allDocs = (documents ?? []) as Document[];

  return {
    caseFile: caseFile as CaseFile,
    facts: (facts ?? []) as FactItem[],
    // Defensively exclude any legacy "pre_warmed" rows (the feature was retired);
    // a one-time migration promotes/cleans them, this guards stragglers.
    documents: allDocs.filter((d) => d.status !== "pre_warmed" && !d.parent_document_id),
    childDocuments: allDocs.filter((d) => !!d.parent_document_id),
    userId,
    consultRequest: (consultRow as ConsultRequest | null) ?? null,
    completedConsultWrapUp: completedConsultRow?.post_consult_plan
      ? normalizeWrapUp(completedConsultRow.post_consult_plan as ConsultWrapUp)
      : null,
    completedConsultSubmittedAt: (completedConsultRow as ConsultRequest | null)?.wrap_up_submitted_at ?? null,
    hasConsultSub: subRow?.plan === "consult" && ["active", "bypass"].includes(subRow?.status ?? ""),
    requestedAttachments: (requestedRows ?? []) as RequestedAttachment[],
    govForms: (formRows ?? []) as GovFormInstrument[],
    attachments: (attachmentRows ?? []) as Attachment[],
    roadmapOverlay: parseRoadmapOverlay(roadmapSnap?.ai_overlay) as RoadmapAiOverlay,
    accountEmail: profileRow?.email ?? "",
    accountName: personDisplayName(
      { full_name: profileRow?.full_name, email: profileRow?.email },
      profileRow?.email ?? "Account",
    ),
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

  const { caseFile, facts, documents, childDocuments, consultRequest, hasConsultSub, completedConsultWrapUp, completedConsultSubmittedAt, requestedAttachments, govForms, attachments, roadmapOverlay, accountName, accountEmail } = result;

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
          <Link href={`/dashboard/${caseFile.id}/financials`} className="lf-logout-btn">
            Financials
          </Link>
          <Link href={`/chat?caseFileId=${caseFile.id}`} className="lf-begin-btn">
            Continue Intake
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
          <AccountMenu name={accountName} email={accountEmail} />
        </div>
      </header>

      <main className="lf-main">
        <ClientFileView
          caseFile={caseFile}
          facts={facts}
          documents={documents}
          childDocuments={childDocuments}
          requestedAttachments={requestedAttachments}
          attachments={attachments}
          govForms={govForms}
          mode="client"
          consultRequest={consultRequest}
          hasConsultSub={hasConsultSub}
          completedConsultWrapUp={completedConsultWrapUp}
          completedConsultSubmittedAt={completedConsultSubmittedAt}
          roadmapOverlay={roadmapOverlay}
        />
      </main>
    </div>
  );
}
