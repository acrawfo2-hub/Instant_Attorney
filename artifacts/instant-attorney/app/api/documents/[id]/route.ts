import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getChildDocuments } from "@/lib/document-utils";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  let isAttorney = false;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;

    const { data: profile } = await db
      .from("profiles")
      .select("is_attorney")
      .eq("id", user.id)
      .single();

    isAttorney = profile?.is_attorney ?? false;
  }

  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("*, case_files(*), profiles!documents_user_id_fkey(*)")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!BYPASS_AUTH && doc.user_id !== userId && !isAttorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const childDocuments = await getChildDocuments(db, id);

  return NextResponse.json({
    ...doc,
    child_documents: childDocuments,
  });
}
