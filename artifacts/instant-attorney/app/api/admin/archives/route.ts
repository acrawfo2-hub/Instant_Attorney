import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getAttorneyUserId } from "@/lib/admin-auth";

/** Attorney-only: list the archive manifest (no decryption). */
export async function GET(req: NextRequest) {
  const attorneyId = await getAttorneyUserId();
  if (!attorneyId) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const userId = req.nextUrl.searchParams.get("userId");
  const email = req.nextUrl.searchParams.get("email");
  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") ?? 0));
  const pageSize = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? 50)));

  const serviceDb = createServiceClient();
  let query = serviceDb
    .from("matter_archives")
    .select(
      "id, case_file_id, user_id, user_email, matter_title, matter_type, file_type, " +
      "document_count, attachment_count, size_bytes, category, legal_hold, " +
      "archived_at, retention_until, destroyed_at",
      { count: "exact" }
    )
    .order("archived_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);

  if (userId) query = query.eq("user_id", userId);
  if (email) query = query.ilike("user_email", email);

  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ archives: data ?? [], total: count ?? 0, page, pageSize });
}
