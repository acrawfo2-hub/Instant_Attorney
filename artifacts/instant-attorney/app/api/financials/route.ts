import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID, type FinancialItem } from "@/lib/types";
import { validateFinancialItemInput, provenanceForSource } from "@/lib/financial-picture";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

interface OwnedCase {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  write: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  caseFile: any;
}

/** Resolve the caller and confirm they own the referenced case file. */
async function resolveOwnedCase(caseFileId: string): Promise<OwnedCase | { error: string; status: number }> {
  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authDb: any;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    authDb = createServiceClient();
  } else {
    authDb = await createClient();
    const { data: { user }, error } = await authDb.auth.getUser();
    if (error || !user) return { error: "Unauthorized", status: 401 };
    userId = user.id;
  }
  if (!caseFileId || typeof caseFileId !== "string") return { error: "Missing case file", status: 400 };
  const { data: cf } = await authDb
    .from("case_files")
    .select("id, user_id, financial_disclosure_acked_at")
    .eq("id", caseFileId)
    .maybeSingle();
  if (!cf || cf.user_id !== userId) return { error: "Not found", status: 404 };
  return { userId, write: createServiceClient(), caseFile: cf };
}

const FIELDS =
  "id, case_file_id, user_id, category, label, acquisition_note, owner, characterization, exempt_status, value_low, value_high, value_basis, valued_as_of, provenance, verification_status, source_attachment_id, phase_collected, privileged, red_flags, needs_attorney_review, status, superseded_by, created_at, updated_at";

/** Validate that a referenced source attachment exists and belongs to this case. */
async function resolveSourceAttachment(owned: OwnedCase, raw: unknown): Promise<string | null> {
  if (typeof raw !== "string" || !raw) return null;
  const { data } = await owned.write
    .from("attachments")
    .select("id, case_file_id")
    .eq("id", raw)
    .maybeSingle();
  return data && data.case_file_id === owned.caseFile.id ? data.id : null;
}

/** List the active financial items for a case. */
export async function GET(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId") ?? "";
  const owned = await resolveOwnedCase(caseFileId);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const { data, error } = await owned.write
    .from("financial_items")
    .select(FIELDS)
    .eq("case_file_id", caseFileId)
    .neq("status", "removed")
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Could not load items." }, { status: 500 });
  return NextResponse.json({ items: (data ?? []) as FinancialItem[] });
}

/** Create a financial item. Requires the disclosure standard to be acknowledged. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const owned = await resolveOwnedCase(String(b.caseFileId ?? ""));
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  // Gate: the client must have acknowledged the disclosure standard first.
  if (!owned.caseFile.financial_disclosure_acked_at) {
    return NextResponse.json({ error: "disclosure_required" }, { status: 412 });
  }

  const errors = validateFinancialItemInput(b);
  if (errors.length) return NextResponse.json({ error: errors[0], errors }, { status: 400 });

  // Optional source document — a stronger source of truth, never required.
  const sourceId = await resolveSourceAttachment(owned, b.source_attachment_id);
  const ground = provenanceForSource(!!sourceId);

  const toNum = (v: unknown) => (v === undefined || v === null || v === "" ? null : Number(v));
  const row = {
    case_file_id: owned.caseFile.id,
    user_id: owned.userId,
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
    // Provenance/verification follow the source: a linked document makes it
    // document-supported; otherwise it's the client's estimate. Attorney
    // verification (the top tier) is set later in the review queue.
    provenance: ground.provenance,
    verification_status: ground.verification_status,
    phase_collected: "phase_2_privileged",
    privileged: true,
  };

  const { data, error } = await owned.write.from("financial_items").insert(row).select(FIELDS).single();
  if (error) return NextResponse.json({ error: "Could not save the item." }, { status: 500 });
  return NextResponse.json({ item: data as FinancialItem });
}
