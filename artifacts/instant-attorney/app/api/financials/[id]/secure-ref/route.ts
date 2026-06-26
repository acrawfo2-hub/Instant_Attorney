import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID, type SecureRefKind } from "@/lib/types";
import { vaultConfigured, getVaultKey, encryptSecret, last4, KEY_VERSION } from "@/lib/secure-vault";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const KINDS: SecureRefKind[] = ["ssn", "account_number", "routing_number", "policy_number", "other"];

/** Resolve the caller and confirm they own the financial item (and its case). */
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
  const { data: item } = await write.from("financial_items").select("id, user_id, case_file_id").eq("id", itemId).maybeSingle();
  if (!item || item.user_id !== userId) return { error: "Not found", status: 404 } as const;
  const { data: cf } = await write.from("case_files").select("user_id, financial_disclosure_acked_at").eq("id", item.case_file_id).maybeSingle();
  if (!cf || cf.user_id !== userId) return { error: "Not found", status: 404 } as const;
  return { userId, write, itemId, acked: !!cf.financial_disclosure_acked_at } as const;
}

/** List the (redacted) secure identifiers attached to an item. Never returns ciphertext. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await resolveOwnedItem(id);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const { data } = await owned.write
    .from("financial_secure_ref")
    .select("id, financial_item_id, kind, last4, created_at")
    .eq("financial_item_id", id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ refs: data ?? [] });
}

/** Encrypt and store a raw identifier in the vault. Returns only redacted metadata. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const owned = await resolveOwnedItem(id);
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });
  if (!owned.acked) return NextResponse.json({ error: "disclosure_required" }, { status: 412 });

  // Fail closed: never store plaintext if the vault key isn't configured.
  if (!vaultConfigured()) return NextResponse.json({ error: "vault_unavailable" }, { status: 503 });

  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const kind = b.kind;
  const value = typeof b.value === "string" ? b.value.trim() : "";
  if (!KINDS.includes(kind as SecureRefKind)) return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "Enter the value." }, { status: 400 });
  if (value.length > 128) return NextResponse.json({ error: "That value is too long." }, { status: 400 });

  const key = getVaultKey()!;
  const ciphertext = encryptSecret(value, key);
  const tail = last4(value);

  const { data, error } = await owned.write
    .from("financial_secure_ref")
    .insert({ financial_item_id: id, user_id: owned.userId, kind, ciphertext, last4: tail, key_version: KEY_VERSION })
    .select("id, financial_item_id, kind, last4, created_at")
    .single();

  if (error) return NextResponse.json({ error: "Could not store the identifier." }, { status: 500 });
  return NextResponse.json({ ref: data });
}
