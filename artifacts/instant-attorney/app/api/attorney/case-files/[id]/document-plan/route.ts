import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isValidWizardType } from "@/lib/document-utils";
import { BYPASS_USER_ID } from "@/lib/types";
import type { LegalStrategy, WizardType } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Lets a reviewing attorney override which document is the file's "lead" (the
// most important one the client should complete first). The AI ranks documents
// in legal_strategy.recommended_wizards; this records a manual override that the
// next-step engine prefers over that ranking. Pass { lead: null } to revert to
// the AI's pick.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  // Two modes: plan-based files send { leadKey } (a PlanEntry.key); legacy files
  // (no document_plan) send { lead } (a wizard type). null clears the override.
  const hasLeadKey = "leadKey" in (body as Record<string, unknown>);
  const rawLead = (body as { lead?: unknown }).lead;
  const rawLeadKey = (body as { leadKey?: unknown }).leadKey;

  let lead: WizardType | null | undefined;
  if (!hasLeadKey) {
    lead =
      rawLead === null || rawLead === undefined
        ? null
        : typeof rawLead === "string" && isValidWizardType(rawLead)
          ? rawLead
          : undefined;
    if (lead === undefined) {
      return NextResponse.json({ error: "Invalid lead document type" }, { status: 400 });
    }
  }

  if (hasLeadKey && rawLeadKey !== null && typeof rawLeadKey !== "string") {
    return NextResponse.json({ error: "Invalid lead key" }, { status: 400 });
  }

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  const { data: caseFile } = await db
    .from("case_files")
    .select("legal_strategy")
    .eq("id", id)
    .single();

  if (!caseFile) {
    return NextResponse.json({ error: "Case file not found" }, { status: 404 });
  }

  const existing = (caseFile.legal_strategy as LegalStrategy | null) ?? {
    summary: "",
    instruments: [],
    strengths: [],
    risks: [],
    recommended_wizards: [],
  };

  let updated: LegalStrategy;
  if (hasLeadKey) {
    const leadKey = rawLeadKey as string | null;
    if (leadKey !== null && !existing.document_plan?.some((e) => e.key === leadKey)) {
      return NextResponse.json({ error: "Lead key not in this file's plan" }, { status: 400 });
    }
    updated = { ...existing, lead_key_override: leadKey };
  } else {
    updated = { ...existing, lead_override: lead ?? null };
  }

  const { error: updateErr } = await db
    .from("case_files")
    .update({ legal_strategy: updated, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ error: "Failed to update document plan" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
