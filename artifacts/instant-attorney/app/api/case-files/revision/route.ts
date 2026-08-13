import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/**
 * A deliberately small freshness endpoint for the Living File.  Keeping this
 * server-side avoids exposing service-role credentials (and works when Realtime
 * is unavailable or a websocket has been disconnected).
 */
export async function GET(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  const authDb = BYPASS_AUTH ? createServiceClient() : await createClient();
  const userId = BYPASS_AUTH
    ? BYPASS_USER_ID
    : (await authDb.auth.getUser()).data.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Authorize through RLS first. Attorneys who can see a client's file through
  // policy are also allowed to observe its revision.
  const { data: visibleFile } = await authDb
    .from("case_files")
    .select("id")
    .eq("id", caseFileId)
    .maybeSingle();
  if (!visibleFile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const db = createServiceClient();
  const specs = [
    ["case_files", "id,updated_at,status,next_action,summary,legal_strategy", "id"],
    ["fact_items", "id,updated_at,created_at,status,description", "case_file_id"],
    ["documents", "id,updated_at,status,review_status,reviewed_at", "case_file_id"],
    ["client_workspace_drafts", "id,updated_at,promoted_document_id", "case_file_id"],
    ["attachments", "id,updated_at,status,ai_summary,urgent_findings", "case_file_id"],
    ["requested_attachments", "id,status,fulfilled_by,created_at", "case_file_id"],
    ["form_instruments", "id,updated_at,status,lookup_status", "case_file_id"],
    ["consult_requests", "id,updated_at,status", "case_file_id"],
    ["document_review_runs", "id,updated_at,status,stage", "case_file_id"],
  ] as const;

  const results = await Promise.all(specs.map(async ([table, columns, key]) => {
    const { data, error } = await db.from(table).select(columns).eq(key, caseFileId).order("id");
    // Optional/older tables must not make freshness recovery fail completely.
    return error ? [] : data ?? [];
  }));
  const revision = createHash("sha256")
    .update(JSON.stringify(results))
    .digest("base64url")
    .slice(0, 20);

  return NextResponse.json({ revision }, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
