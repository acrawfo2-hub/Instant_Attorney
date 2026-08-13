import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document, DocumentImprovement } from "@/lib/types";
import { affectsAuthorities, applyImprovementDiff, createImprovementDiff, locateImprovementRange, type ImprovementDiff } from "@/lib/improvement-diffs";
import { runAuthoritiesGate } from "@/lib/attorney-review-authorities";
import { saveDocumentRevision } from "@/lib/document-persistence";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

async function requireAttorney(): Promise<{ db: Db; userId: string } | null> {
  if (BYPASS_AUTH) return { db: createServiceClient(), userId: BYPASS_USER_ID };
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", user.id).maybeSingle();
  return profile?.is_attorney ? { db, userId: user.id } : null;
}

async function loadImprovement(id: string, improvementId: string) {
  const svc = createServiceClient();
  const { data: improvement } = await svc.from("document_improvements").select("*").eq("id", improvementId).eq("document_id", id).maybeSingle();
  const { data: working } = await svc.from("documents").select("*").eq("parent_document_id", id).eq("doc_type", "second_draft").maybeSingle();
  return { svc, improvement: improvement as DocumentImprovement | null, working: working as Document | null };
}

/** Create and persist a preview. This endpoint never changes the working text. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; improvementId: string }> }) {
  const { id, improvementId } = await params;
  if (!(await requireAttorney())) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  const { svc, improvement, working } = await loadImprovement(id, improvementId);
  if (!improvement || !working?.draft_text) return NextResponse.json({ error: "Finding or working revision not found" }, { status: 404 });
  if (improvement.status !== "proposed") return NextResponse.json({ error: "This finding already has an attorney disposition" }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { edited_text?: unknown };
  const replacement = typeof body.edited_text === "string" ? body.edited_text : improvement.proposed_change;
  if (!replacement.trim()) return NextResponse.json({ error: "Replacement text is required" }, { status: 400 });
  const anchor = improvement.anchor ?? locateImprovementRange(working.draft_text, improvement);
  try {
    const proposedDiff = createImprovementDiff(working.draft_text, anchor, replacement);
    const { data, error } = await svc.from("document_improvements").update({ anchor, proposed_diff: proposedDiff, updated_at: new Date().toISOString() }).eq("id", improvementId).select("*").single();
    if (error) throw error;
    return NextResponse.json({ improvement: data, proposedDiff });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create diff" }, { status: 409 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; improvementId: string }> }) {
  const { id, improvementId } = await params;
  const ctx = await requireAttorney();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { disposition?: unknown; rationale?: unknown };
  const disposition = body.disposition;
  if (!["accepted", "rejected", "ask_partner", "needs_client_input"].includes(String(disposition))) {
    return NextResponse.json({ error: "Invalid disposition" }, { status: 400 });
  }
  const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";
  const { svc, improvement, working } = await loadImprovement(id, improvementId);
  if (!improvement || !working?.draft_text) return NextResponse.json({ error: "Finding or working revision not found" }, { status: 404 });
  if (improvement.status !== "proposed") return NextResponse.json({ error: "This finding already has an attorney disposition" }, { status: 409 });

  let draftText = working.draft_text;
  const diff = improvement.proposed_diff as ImprovementDiff | null;
  if (disposition === "accepted") {
    if (!diff) return NextResponse.json({ error: "Create and review a proposed diff before accepting" }, { status: 409 });
    try { draftText = applyImprovementDiff(draftText, diff); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Diff conflict" }, { status: 409 }); }
    const contentJson = { ...((working.content_json ?? {}) as Record<string, unknown>), last_improvement_id: improvementId };
    // Accepting a finding changes the working document's text, so it goes
    // through the persistence boundary: the accepted passage can fill or open a
    // placeholder, and the Living File has to learn about it like any other save.
    try {
      await saveDocumentRevision(svc, {
        caseFileId: working.case_file_id,
        userId: working.user_id,
        draftText,
        persist: async () => {
          const { error } = await svc.from("documents").update({ draft_text: draftText, content_json: contentJson, updated_at: new Date().toISOString() }).eq("id", working.id);
          if (error) throw error;
          return working.id;
        },
      });
    } catch {
      return NextResponse.json({ error: "Could not update working revision" }, { status: 500 });
    }
    await svc.from("documents").update({ improved_draft_text: draftText, updated_at: new Date().toISOString() }).eq("id", id);

    // Rebase every still-open finding onto the accepted revision. Keep its
    // section_id stable while refreshing offsets, quote and revision hash.
    const { data: openFindings } = await svc.from("document_improvements").select("*")
      .eq("run_id", improvement.run_id).eq("status", "proposed").neq("id", improvementId);
    for (const finding of (openFindings ?? []) as DocumentImprovement[]) {
      const located = locateImprovementRange(draftText, finding);
      const anchor = { ...located, section_id: finding.anchor?.section_id ?? located.section_id };
      await svc.from("document_improvements").update({ anchor, proposed_diff: null, updated_at: new Date().toISOString() }).eq("id", finding.id);
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await svc.from("document_improvements").update({ status: disposition, attorney_rationale: rationale, disposition_by: ctx.userId, disposition_at: now, updated_at: now }).eq("id", improvementId).select("*").single();
  if (error) return NextResponse.json({ error: "Could not save disposition" }, { status: 500 });

  // Authorities is the only current QA gate. Re-run it only when this accepted
  // passage can affect an authority; clarity-only edits leave verified QA intact.
  let qaRerun = false;
  if (disposition === "accepted" && diff && affectsAuthorities(diff)) {
    const { data: parent } = await svc.from("documents").select("*").eq("id", id).single();
    if (parent) { await runAuthoritiesGate(svc, improvement.run_id, parent as Document, draftText); qaRerun = true; }
  }
  return NextResponse.json({ improvement: data, workingDraft: disposition === "accepted" ? draftText : undefined, qaRerun });
}
