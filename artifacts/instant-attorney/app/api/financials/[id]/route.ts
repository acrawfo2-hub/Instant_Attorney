import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID, type FinancialItem } from "@/lib/types";
import { validateFinancialItemInput, provenanceForSource } from "@/lib/financial-picture";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

const FIELDS =
  "id, case_file_id, user_id, category, label, acquisition_note, owner, characterization, exempt_status, value_low, value_high, value_basis, valued_as_of, provenance, verification_status, source_attachment_id, phase_collected, privileged, red_flags, needs_attorney_review, status, superseded_by, created_at, updated_at";

/** Resolve the caller, then load the item and confirm they own its case. */
async function resolveOwnedItem(itemId: string) {
  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const authDb = await createClient();
    const { data: { user }, error } = await authDb.auth.getUser();
    if (error || !user) return { error: "Unauthorized", status: 401 } as const;
    userId = user.id;
  }
  const write = createServiceClient();
  const { data: item } = await write
    .from("financial_items")
    .select("id, case_file_id, user_id, verification_status")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.user_id !== userId) return { error: "Not found", status: 404 } as const;
  // Confirm the case is still owned by this user.
  const { data: cf } = await write.from("case_files").select("user_id").eq("id", item.case_file_id).maybeSingle();
  if (!cf || cf.user_id !== userId) return { error: "Not found", status: 404 } as const;
  return { userId, write, itemId, caseFileId: item.case_file_id as string, verificationStatus: item.verification_status as string } as const;
}

/** Edit an item's user-supplied fields (never its provenance/verification). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await resolveOwnedItem(id);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const errors = validateFinancialItemInput(b);
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

  // Optional source document. Re-linking refreshes the document-supported tier,
  // but never downgrades an item the attorney has already verified.
  let sourceId: string | null = null;
  if (typeof b.source_attachment_id === "string" && b.source_attachment_id) {
    const { data: att } = await owned.write
      .from("attachments")
      .select("id, case_file_id")
      .eq("id", b.source_attachment_id)
      .maybeSingle();
    if (att && att.case_file_id === owned.caseFileId) sourceId = att.id;
  }
  const ground = provenanceForSource(!!sourceId);

  const toNum = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  // Allowlist of client-editable columns only.
  const update: Record<string, unknown> = {
    category: b.category,
    label: String(b.label).trim(),
    acquisition_note: typeof b.acquisition_note === "string" && b.acquisition_note.trim() ? b.acquisition_note.trim() : null,
    owner: b.owner ?? "client",
    characterization: b.characterization ?? "mixed_or_unknown",
    exempt_status: b.exempt_status ?? "unknown",
    value_low: toNum(b.value_low),
    value_high: toNum(b.value_high),
    value_basis: b.value_basis ?? "client_estimate",
    valued_as_of: typeof b.valued_as_of === "string" && b.valued_as_of ? b.valued_as_of : null,
    source_attachment_id: sourceId,
    updated_at: new Date().toISOString(),
  };
  if (owned.verificationStatus !== "attorney_verified") {
    update.provenance = ground.provenance;
    update.verification_status = ground.verification_status;
  }

  const { data, error } = await owned.write.from("financial_items").update(update).eq("id", id).select(FIELDS).single();
  if (error) return NextResponse.json({ error: "Could not save the change." }, { status: 500 });
  return NextResponse.json({ item: data as FinancialItem });
}

/** Soft-remove an item (kept as history, never hard-deleted). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await resolveOwnedItem(id);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const { error } = await owned.write
    .from("financial_items")
    .update({ status: "removed", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return NextResponse.json({ error: "Could not remove the item." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
