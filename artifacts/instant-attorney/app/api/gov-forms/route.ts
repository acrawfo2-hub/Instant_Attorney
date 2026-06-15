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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let db: any;

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
    db = createServiceClient();
  } else {
    db = await createClient();
    const { data: { user }, error } = await db.auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const { data: rows } = await db
    .from("form_instruments")
    .select("*")
    .eq("case_file_id", caseFileId)
    .eq("user_id", userId) // belt-and-suspenders alongside RLS
    .neq("status", "dismissed")
    .order("created_at", { ascending: true });

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
