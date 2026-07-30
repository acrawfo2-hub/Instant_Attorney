import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { DocumentQaCitation } from "@/lib/types";

// Attorney override for the Authorities gate (schema-stage45): waive (or un-waive)
// a single citation so it no longer blocks approval. The attorney is the human in
// the loop — a waive is a deliberate "I've checked this myself" acknowledgement.

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAttorney(): Promise<{ db: any; userId: string } | null> {
  if (BYPASS_AUTH) return { db: createServiceClient(), userId: BYPASS_USER_ID };
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", user.id).maybeSingle();
  if (!profile?.is_attorney) return null;
  return { db, userId: user.id };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; citationId: string }> },
) {
  const { id, citationId } = await params;
  const ctx = await requireAttorney();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { waived?: unknown };
  const waived = body.waived !== false; // default to waiving

  // Writes go through the service client — the citation table grants attorneys
  // SELECT only. Ownership is enforced by the id + document_id filter.
  const svc = createServiceClient();
  const { data, error } = await svc
    .from("document_qa_citations")
    .update({ waived, waived_at: waived ? new Date().toISOString() : null })
    .eq("id", citationId)
    .eq("document_id", id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Citation not found" }, { status: 404 });
  }
  return NextResponse.json({ citation: data as DocumentQaCitation });
}
