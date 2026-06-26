import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { GovFormInstrument } from "@/lib/types";
import { resolveForm, computeProgress } from "@/lib/gov-form-guide";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// GET /api/gov-forms?caseFileId=... — the government forms this client needs to
// complete (their "legal instruments"), each enriched with registry detail and
// completion progress.
export async function GET(req: NextRequest) {
  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  if (!caseFileId) {
    return NextResponse.json({ error: "caseFileId is required" }, { status: 400 });
  }

  let userId: string;
  let isAttorney = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    isAttorney = true;
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
    const { data: profile } = await db
      .from("profiles")
      .select("is_attorney")
      .eq("id", userId)
      .single();
    isAttorney = profile?.is_attorney ?? false;
  }

  // Attorneys read any client's instruments (service client bypasses RLS);
  // clients are scoped to their own rows.
  const queryDb = isAttorney ? createServiceClient() : db;
  const formQ = queryDb
    .from("form_instruments")
    .select("*")
    .eq("case_file_id", caseFileId)
    .neq("status", "dismissed")
    .order("created_at", { ascending: true });
  if (!isAttorney) formQ.eq("user_id", userId);
  const { data: rows } = await formQ;

  const instruments = ((rows ?? []) as GovFormInstrument[]).flatMap((row) => {
    const form = resolveForm(row);
    if (!form) return []; // unresolvable (e.g. registry key removed)
    return [{
      ...row,
      // Dynamic forms are never source-verified; the client always sees them as
      // "confirm against the official source".
      verified: row.source === "registry",
      form: {
        form_number: form.form_number,
        title: form.title,
        agency: form.agency,
        jurisdiction: form.jurisdiction,
        official_url: form.official_url,
        deadline: form.deadline,
        field_count: form.fields.length,
      },
      progress: computeProgress(form, row.answers ?? {}),
    }];
  });

  return NextResponse.json({ instruments });
}
