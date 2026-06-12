import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { isValidWizardType } from "@/lib/document-utils";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function GET(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  const docType = req.nextUrl.searchParams.get("docType");

  if (!caseFileId || !docType) {
    return NextResponse.json({ error: "caseFileId and docType required" }, { status: 400 });
  }

  if (!isValidWizardType(docType)) {
    return NextResponse.json({ error: "Invalid doc type" }, { status: 400 });
  }

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

  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("id, draft_text, status, content_json, doc_type, submitted_at")
    .eq("case_file_id", caseFileId)
    .eq("doc_type", docType)
    .eq("user_id", userId)
    .in("status", ["pre_warmed", "draft"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(doc);
}
