import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { signatureName, agreementType } = await req.json();

  if (!signatureName || !agreementType) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    // Ensure bypass profile exists
    await db.from("profiles").upsert({
      id: BYPASS_USER_ID,
      email: "test@instant-attorney.dev",
      full_name: signatureName || "Test User",
    }, { onConflict: "id" });
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  if (agreementType === "representation") {
    const { error } = await db.from("representation_agreements").insert({
      user_id: userId,
      signature_name: signatureName,
      agreement_version: "2.0-draft",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else if (agreementType === "ai_consent") {
    const { error } = await db.from("ai_consents").insert({
      user_id: userId,
      consent_version: "2.0-draft",
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: "Unknown agreement type" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
