import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";

/** List attorney-user signups for the manual-approval queue. */
export async function GET() {
  const attorneyId = await getAttorneyUserId();
  if (!attorneyId) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const serviceDb = createServiceClient();
  const { data, error } = await serviceDb
    .from("profiles")
    .select("id, email, full_name, phone, bar_number, firm_name, attorney_user_status, created_at")
    .eq("account_type", "attorney_user")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ signups: data ?? [] });
}
