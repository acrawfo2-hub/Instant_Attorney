import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";
import type { VerificationStatus } from "@/lib/types";

const VALID: VerificationStatus[] = ["unverified", "doc_supported", "attorney_verified"];

const FIELDS =
  "id, case_file_id, user_id, category, label, acquisition_note, owner, characterization, exempt_status, value_low, value_high, value_basis, valued_as_of, provenance, verification_status, source_attachment_id, phase_collected, privileged, red_flags, needs_attorney_review, status, superseded_by, created_at, updated_at";

/**
 * Attorney action on a financial item: set its verification level and/or resolve
 * its red flags. This is the human gate that lets a sworn filing proceed.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const attorneyId = await getAttorneyUserId();
  if (!attorneyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (b.verification_status !== undefined) {
    if (!VALID.includes(b.verification_status as VerificationStatus)) {
      return NextResponse.json({ error: "Invalid verification status" }, { status: 400 });
    }
    update.verification_status = b.verification_status;
    // Attorney verification is also the top provenance tier.
    if (b.verification_status === "attorney_verified") update.provenance = "attorney_verified";
  }

  if (b.resolve_flags === true) {
    update.red_flags = [];
    update.needs_attorney_review = false;
  } else if (typeof b.needs_attorney_review === "boolean") {
    update.needs_attorney_review = b.needs_attorney_review;
  }

  const db = createServiceClient();
  const { data, error } = await db.from("financial_items").update(update).eq("id", id).select(FIELDS).single();
  if (error) return NextResponse.json({ error: "Could not update the item." }, { status: 500 });
  return NextResponse.json({ item: data });
}
