import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { PartnerRole, RepresentationScope } from "@/lib/types";
import { FINANCIAL_DISCLOSURE_VERSION, requiresNoSecretsAck } from "@/lib/financial-picture";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function resolveOwnedCase(caseFileId: string) {
  let userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let authDb: any;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    authDb = createServiceClient();
  } else {
    authDb = await createClient();
    const { data: { user }, error } = await authDb.auth.getUser();
    if (error || !user) return { error: "Unauthorized", status: 401 } as const;
    userId = user.id;
  }
  if (!caseFileId) return { error: "Missing case file", status: 400 } as const;
  const { data: cf } = await authDb.from("case_files").select("id, user_id").eq("id", caseFileId).maybeSingle();
  if (!cf || cf.user_id !== userId) return { error: "Not found", status: 404 } as const;
  return { userId, write: createServiceClient(), caseFileId: cf.id } as const;
}

const SCOPES: RepresentationScope[] = ["single_client", "joint_spouses"];
const ROLES: PartnerRole[] = ["none", "adverse_party", "joint_client", "non_client_third_party"];

/**
 * Record the client's acknowledgment of the disclosure standard, and/or set the
 * matter's representation context. Body: { caseFileId, action, ... }.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const owned = await resolveOwnedCase(String(b.caseFileId ?? ""));
  if ("error" in owned) return NextResponse.json({ error: owned.error }, { status: owned.status });

  const action = b.action;

  if (action === "ack_disclosure") {
    const { error } = await owned.write
      .from("case_files")
      .update({
        financial_disclosure_acked_at: new Date().toISOString(),
        financial_disclosure_version: FINANCIAL_DISCLOSURE_VERSION,
      })
      .eq("id", owned.caseFileId);
    if (error) return NextResponse.json({ error: "Could not record acknowledgment." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === "set_representation") {
    const scope = (SCOPES.includes(b.representation_scope as RepresentationScope) ? b.representation_scope : "single_client") as RepresentationScope;
    const role = (ROLES.includes(b.partner_role as PartnerRole) ? b.partner_role : "none") as PartnerRole;
    const noSecretsAck = b.joint_no_secrets_ack === true;

    // Joint representation cannot proceed without the no-secrets acknowledgment.
    if (requiresNoSecretsAck(scope, role) && !noSecretsAck) {
      return NextResponse.json({ error: "joint_no_secrets_required" }, { status: 400 });
    }

    const { error } = await owned.write
      .from("case_files")
      .update({
        representation_scope: scope,
        partner_role: role,
        partner_consented: b.partner_consented === true,
        joint_no_secrets_ack: noSecretsAck,
      })
      .eq("id", owned.caseFileId);
    if (error) return NextResponse.json({ error: "Could not save the context." }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
