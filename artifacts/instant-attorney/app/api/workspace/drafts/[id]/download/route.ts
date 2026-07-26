import { NextRequest, NextResponse } from "next/server";
import { getClientContext } from "@/lib/client-workspace-auth";
import type { ClientWorkspaceDraft } from "@/lib/types";

// Download a consumer freestyle draft as Markdown. The title becomes the filename.
function safeFileName(title: string): string {
  const base = (title || "draft").trim().replace(/[^\w\d\-. ]+/g, "").replace(/\s+/g, "-").slice(0, 80);
  return `${base || "draft"}.md`;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getClientContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { data, error } = await ctx.db
    .from("client_workspace_drafts")
    .select("*")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Draft not found" }, { status: 404 });
  }
  const draft = data as ClientWorkspaceDraft;
  const body = `# ${draft.title}\n\n${draft.content}\n`;

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName(draft.title)}"`,
      "Cache-Control": "no-store",
    },
  });
}
