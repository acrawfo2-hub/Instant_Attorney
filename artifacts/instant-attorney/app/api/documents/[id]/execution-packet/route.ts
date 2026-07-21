import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import { resolveExecution } from "@/lib/execution";
import { buildExecutionPacketDocx } from "@/lib/execution-packet";
import { docxContentDisposition } from "@/lib/doc-generator";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/**
 * Download a print-and-go execution packet for an approved document.
 * Separate from the approved draft so we never alter attorney-reviewed bytes.
 */
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
    const {
      data: { user },
      error,
    } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
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
    .select("id, user_id, title, doc_type, status, content_json")
    .eq("id", id)
    .single();

  if (docErr || !doc) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const isOwner = doc.user_id === userId;
  const isAttorney = profile?.is_attorney === true;
  if (!isOwner && !isAttorney) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (doc.status !== "approved" && doc.status !== "delivered") {
    return NextResponse.json(
      { error: "Execution packet is only available after attorney approval" },
      { status: 400 }
    );
  }

  const planKey =
    typeof (doc.content_json as Record<string, unknown> | null)?.plan_key === "string"
      ? ((doc.content_json as Record<string, unknown>).plan_key as string)
      : null;

  const execution = resolveExecution({
    instrumentKey: planKey,
    title: doc.title,
    docType: doc.doc_type,
  });

  const buffer = await buildExecutionPacketDocx({
    documentTitle: doc.title,
    execution,
  });

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": docxContentDisposition(
        `Execution-Packet-${doc.title}.docx`
      ),
    },
  });
}
