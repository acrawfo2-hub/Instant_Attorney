import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { retryDocumentLivingFileSync } from "@/lib/document-persistence";
import { BYPASS_USER_ID } from "@/lib/types";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const authDb = process.env.BYPASS_AUTH === "true" ? createServiceClient() : await createClient();
  const userId = process.env.BYPASS_AUTH === "true" ? BYPASS_USER_ID : (await (authDb as Awaited<ReturnType<typeof createClient>>).auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await authDb.from("profiles").select("is_attorney").eq("id", userId).maybeSingle();
  const serviceDb = createServiceClient();
  const { data: doc } = await serviceDb.from("documents").select("id, user_id").eq("id", id).maybeSingle();
  if (!doc || (doc.user_id !== userId && !profile?.is_attorney)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { await retryDocumentLivingFileSync(serviceDb, id); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Reconciliation is still pending. Please retry." }, { status: 503 }); }
}
