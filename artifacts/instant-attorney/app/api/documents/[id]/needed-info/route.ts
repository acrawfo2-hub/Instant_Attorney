import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { generateNeededInfoDocx } from "@/lib/doc-generator";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// One-page "Information Still Needed" checklist derived from the [[placeholders]]
// in a document's current draft. Deterministic — no model call.
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

  const text = doc.draft_text || doc.review_report || doc.improved_draft_text;
  if (!text) {
    return NextResponse.json({ error: "No draft text available" }, { status: 404 });
  }

  let buffer: Buffer;
  try {
    buffer = await generateNeededInfoDocx(doc.title, text);
  } catch (err) {
    console.error("[documents/needed-info] docx generation error:", err);
    return NextResponse.json({ error: "Could not build the report" }, { status: 500 });
  }

  const filename = `${doc.title.replace(/\s+/g, "_")}_Information_Needed.docx`;
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
