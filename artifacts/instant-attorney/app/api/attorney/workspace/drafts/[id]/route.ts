import { NextRequest, NextResponse } from "next/server";
import { getWorkspaceContext } from "@/lib/workspace-auth";

// Edit a freestyle draft in place (title and/or body). Attorney edits set
// source='attorney' so a later same-title regeneration doesn't silently clobber
// hand-written changes without the attorney noticing the source flip.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { id } = await params;
  const { title, content } = await req.json().catch(() => ({})) as { title?: string; content?: string };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), source: "attorney" };
  if (typeof title === "string") update.title = title.trim() || "Untitled draft";
  if (typeof content === "string") update.content = content;

  const { data, error } = await ctx.db
    .from("attorney_workspace_drafts")
    .update(update)
    .eq("id", id)
    .eq("attorney_id", ctx.attorneyId)
    .select()
    .single();

  if (error || !data) {
    console.error("[workspace/drafts] update error:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { id } = await params;
  const { error } = await ctx.db
    .from("attorney_workspace_drafts")
    .delete()
    .eq("id", id)
    .eq("attorney_id", ctx.attorneyId);

  if (error) {
    console.error("[workspace/drafts] delete error:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
