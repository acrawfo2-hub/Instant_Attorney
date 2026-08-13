import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Attorney-only: onboard a client from the attorney's regular practice into a new
// ACP-protected case file owned by the attorney's own account. The attorney then
// uses the normal client surfaces (chat, uploads, drafting, review) on it — only
// they can see it, since they own it.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const clientName = typeof body?.clientName === "string" ? body.clientName.trim() : "";
  const clientEmail =
    typeof body?.clientEmail === "string" && body.clientEmail.trim()
      ? body.clientEmail.trim()
      : null;

  if (!clientName) {
    return NextResponse.json({ error: "Client name is required" }, { status: 400 });
  }

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let attorneyId: string;
  if (BYPASS_AUTH) {
    attorneyId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    attorneyId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", attorneyId).single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  // Ensure the attorney account has an active (bypass) subscription so it passes
  // the client-side subscription/billing gates (chat, drafting, file
  // view). ignoreDuplicates so an existing subscription is never overwritten.
  await createServiceClient()
    .from("subscriptions")
    .upsert({ user_id: attorneyId, status: "bypass", plan: "phase2" }, { onConflict: "user_id", ignoreDuplicates: true })
    .then(undefined, (err) => console.error("[attorney/client-files] bypass sub upsert error:", err));

  const { data: created, error } = await db
    .from("case_files")
    .insert({
      user_id: attorneyId,
      created_by_attorney: true,
      client_display_name: clientName,
      client_email: clientEmail,
      file_type: "standard",
    })
    .select("id")
    .single();

  if (error || !created) {
    console.error("[attorney/client-files] create error:", error);
    return NextResponse.json({ error: "Could not create the client file" }, { status: 500 });
  }

  return NextResponse.json({ id: created.id });
}
