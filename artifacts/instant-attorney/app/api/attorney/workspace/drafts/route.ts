import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/workspace-auth";

// Freestyle side-panel drafts for a case file. Attorney work-product — the
// gate + RLS guarantee an attorney only ever sees their own drafts.
export async function GET(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const caseFileId = req.nextUrl.searchParams.get("caseFileId");
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  const { data, error } = await ctx.db
    .from("attorney_workspace_drafts")
    .select("*")
    .eq("case_file_id", caseFileId)
    .eq("attorney_id", ctx.attorneyId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[workspace/drafts] list error:", error);
    return NextResponse.json({ error: "Failed to load drafts" }, { status: 500 });
  }
  return NextResponse.json({ drafts: data ?? [] });
}

// Create a blank (or seeded) draft the attorney starts by hand.
export async function POST(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { caseFileId, title, content } = await req.json().catch(() => ({})) as {
    caseFileId?: string; title?: string; content?: string;
  };
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  const { data, error } = await ctx.db
    .from("attorney_workspace_drafts")
    .insert({
      case_file_id: caseFileId,
      attorney_id: ctx.attorneyId,
      title: (title ?? "").trim() || "Untitled draft",
      content: content ?? "",
      source: "attorney",
    })
    .select()
    .single();

  if (error || !data) {
    console.error("[workspace/drafts] create error:", error);
    return NextResponse.json({ error: "Failed to create draft" }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}
