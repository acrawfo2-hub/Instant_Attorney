import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { CaseFile, FactItem, BYPASS_USER_ID } from "@/lib/types";
import type { Document, ConsultRequest, ConsultWrapUp, RequestedAttachment, GovFormInstrument, Attachment } from "@/lib/types";
import { normalizeWrapUp } from "@/lib/consult-wrap-up";
import ClientFileView from "@/components/ClientFileView";
import AccountMenu from "@/components/AccountMenu";
import MatterSwitcher from "@/components/MatterSwitcher";
import { parseRoadmapOverlay } from "@/lib/roadmap-snapshot";
import type { RoadmapAiOverlay } from "@/lib/roadmap-types";
import { toMatterSwitcherItem } from "@/lib/matter-switcher";
import { computeNextStep } from "@/lib/next-step";
import { getCaseHeaderCta } from "@/lib/case-cta";

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

  const [{ data: caseFile }, { data: facts }, { data: documents }, { data: consultRow }, { data: completedConsultRow }, { data: subRow }, { data: requestedRows }, { data: formRows }, { data: attachmentRows }, { data: roadmapSnap }, { data: siblingRows }] = await Promise.all([
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
      .from("attachments")
      .select("*")
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: true }),
    db
      .from("roadmap_snapshots")
      .select("ai_overlay")
      .eq("case_file_id", caseFileId)
      .maybeSingle(),
    db
      .from("case_files")
      .select("id, title, matter_subtype, matter_type, file_type, next_action, updated_at, status")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("updated_at", { ascending: false }),
  ]);

  if (!BYPASS_AUTH && (!subRow || !["active", "trialing", "bypass"].includes(subRow?.status ?? ""))) {
    redirect("/onboarding");
  }

  if (!caseFile) return null;

  const allDocs = (documents ?? []) as Document[];
  type SiblingRow = {
    id: string;
    title: string | null;
    matter_subtype: string | null;
    matter_type: string | null;
    file_type: string | null;
    next_action: string | null;
    updated_at: string;
  };
  const openMatters = ((siblingRows ?? []) as SiblingRow[]).map(toMatterSwitcherItem);

  // Ensure the current file is always in the switcher list even if the sibling
  // query raced ahead of a just-opened row.
  if (!openMatters.some((m) => m.id === caseFileId)) {
    openMatters.unshift(toMatterSwitcherItem(caseFile as CaseFile));
  }

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
    openMatters,
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

  const { caseFile, facts, documents, childDocuments, consultRequest, hasConsultSub, completedConsultWrapUp, completedConsultSubmittedAt, requestedAttachments, govForms, attachments, roadmapOverlay, openMatters } = result;

  const headerCta = getCaseHeaderCta(
    computeNextStep(caseFile, documents, facts),
    caseFile.id,
  );

  return (
    <div className="lf-shell">
      <header className="lf-header">
        <Link href="/dashboard" className="lf-header-logo">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          All matters
        </Link>

        <div className="lf-header-center">
          <MatterSwitcher currentId={caseFile.id} matters={openMatters} />
          {caseFile.matter_type && (
            <span
              className="lf-badge"
              title={caseFile.matter_type === "reactive" ? "Something happened that you need help with" : "Planning ahead before a problem arises"}
            >
              {caseFile.matter_type === "reactive" ? "Active case" : "Planning ahead"}
            </span>
          )}
        </div>

        <div className="lf-header-right">
          {isBypass && <span className="ob-bypass-badge">Test Mode</span>}
          <Link href={`/dashboard/${caseFile.id}/financials`} className="lf-logout-btn" title="Assets, debts, and income worksheet">
            Money &amp; property
          </Link>
          <Link href={headerCta.href} className="lf-begin-btn">
            {headerCta.label}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </Link>
          <AccountMenu />
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
