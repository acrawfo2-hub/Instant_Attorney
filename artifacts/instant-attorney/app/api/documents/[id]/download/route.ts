import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateDocxFromText } from "@/lib/doc-generator";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
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

  const { data: profile } = BYPASS_AUTH
    ? { data: { is_attorney: false } }
    : await db.from("profiles").select("is_attorney").eq("id", userId).single();

  const { data: doc, error: docErr } = await db
    .from("documents")
    .select("*")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only the owning client or an attorney can download
  if (doc.user_id !== userId && !profile?.is_attorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Every renderable doc type keeps its text in draft_text (the critical-review
  // and second-draft children do too); fall back to the legacy columns just in
  // case an older row only populated those.
  const text = doc.draft_text || doc.review_report || doc.improved_draft_text;
  if (!text) {
    return NextResponse.json({ error: "No draft text available" }, { status: 404 });
  }

  // Fetch the case file with the service client rather than an RLS-scoped join.
  // An attorney downloading a client's document gets the document row but a NULL
  // embedded case_files under RLS — which used to crash the docx builder. This
  // path is already authorized above, so a service-role read is safe.
  const { data: caseFile } = await createServiceClient()
    .from("case_files")
    .select("matter_subtype, jurisdiction")
    .eq("id", doc.case_file_id)
    .maybeSingle();

  let buffer: Buffer;
  try {
    buffer = await generateDocxFromText(doc.title, text, (caseFile as CaseFile) ?? null);
  } catch (err) {
    console.error("[documents/download] docx generation error:", err);
    return NextResponse.json({ error: "Could not build the document file" }, { status: 500 });
  }
  const filename = `${doc.title.replace(/\s+/g, "_")}.docx`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
