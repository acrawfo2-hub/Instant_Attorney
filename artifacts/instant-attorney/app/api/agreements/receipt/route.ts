import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import {
  REPRESENTATION_AGREEMENT_TEXT,
  buildAgreementReceiptDocx,
} from "@/lib/agreement-sign";
import { docxContentDisposition } from "@/lib/doc-generator";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/**
 * Download a .docx receipt for the caller's most recent representation agreement.
 * Evidentiary package: signed name, version, content hash, IP/UA, full text.
 */
export async function GET(_req: NextRequest) {
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

  const { data: row, error } = await db
    .from("representation_agreements")
    .select("signature_name, agreement_version, content_sha256, signer_ip, signer_user_agent, signed_at")
    .eq("user_id", userId)
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "No signed agreement found" }, { status: 404 });
  }

  const buffer = await buildAgreementReceiptDocx({
    signatureName: row.signature_name,
    agreementVersion: row.agreement_version,
    contentSha256: row.content_sha256 ?? "(not recorded — signed before audit trail)",
    signedAt: row.signed_at ?? new Date().toISOString(),
    signerIp: row.signer_ip ?? null,
    signerUserAgent: row.signer_user_agent ?? null,
    agreementText: REPRESENTATION_AGREEMENT_TEXT,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": docxContentDisposition(
        `Crawford-Law-Representation-Agreement-${row.agreement_version}.docx`
      ),
    },
  });
}
