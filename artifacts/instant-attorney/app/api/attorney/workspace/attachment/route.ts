import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace-auth";

// Serve a freestyle work-product attachment by its storage path. Paths are
// namespaced workspace/{attorneyId}/{caseFileId}/... — we only sign a path whose
// attorney segment matches the caller, so one attorney can never fetch another's
// work-product even with a guessed path.
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const path = req.nextUrl.searchParams.get("path") ?? "";
  if (!path.startsWith(`workspace/${ctx.attorneyId}/`)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const serviceDb = createServiceClient();
  const { data: signed, error } = await serviceDb.storage
    .from("case-attachments")
    .createSignedUrl(path, 300); // 5-minute window

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not generate link" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl, 302);
}
