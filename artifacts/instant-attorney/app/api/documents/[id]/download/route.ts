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
    .select("*, case_files(*)")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Only the owning client or an attorney can download
  if (doc.user_id !== userId && !profile?.is_attorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!doc.draft_text) {
    return NextResponse.json({ error: "No draft text available" }, { status: 404 });
  }

  const caseFile = doc.case_files as CaseFile;
  let buffer: Buffer;
  try {
    buffer = await generateDocxFromText(doc.title, doc.draft_text, caseFile);
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
