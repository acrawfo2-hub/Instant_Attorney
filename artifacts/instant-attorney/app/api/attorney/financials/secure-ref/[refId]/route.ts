import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";
import { vaultConfigured, getVaultKey, decryptSecret } from "@/lib/secure-vault";

/**
 * Decrypt a vaulted identifier — the ONLY path that returns plaintext, and only
 * to a verified attorney, for filing-time use. The value is never sent to the
 * model and never exposed to a client JWT.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ refId: string }> }) {
  const { refId } = await params;
  const attorneyId = await getAttorneyUserId();
  if (!attorneyId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!vaultConfigured()) return NextResponse.json({ error: "vault_unavailable" }, { status: 503 });

  const db = createServiceClient();
  const { data: ref } = await db
    .from("financial_secure_ref")
    .select("id, financial_item_id, kind, ciphertext")
    .eq("id", refId)
    .maybeSingle();
  if (!ref) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let value: string;
  try {
    value = decryptSecret(ref.ciphertext, getVaultKey()!);
  } catch {
    return NextResponse.json({ error: "Could not decrypt." }, { status: 500 });
  }

  // Lightweight access trail (a fuller audit log is a future enhancement).
  console.info(`[secure-ref] attorney ${attorneyId} revealed ref ${ref.id} (${ref.kind})`);

  return NextResponse.json({ id: ref.id, kind: ref.kind, value });
}
