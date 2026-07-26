import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/workspace-auth";
import type { AttorneyWorkspaceDraft } from "@/lib/types";

// Download a freestyle draft as a Markdown file. Attorney work-product; the
// document title becomes the filename.
function safeFileName(title: string): string {
  const base = (title || "draft").trim().replace(/[^\w\d\-. ]+/g, "").replace(/\s+/g, "-").slice(0, 80);
  return `${base || "draft"}.md`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { id } = await params;
  const { data, error } = await ctx.db
    .from("attorney_workspace_drafts")
    .select("*")
    .eq("id", id)
    .eq("attorney_id", ctx.attorneyId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  const draft = data as AttorneyWorkspaceDraft;
  const body = `# ${draft.title}\n\n${draft.content}\n`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName(draft.title)}"`,
      "Cache-Control": "no-store",
    },
  });
}
