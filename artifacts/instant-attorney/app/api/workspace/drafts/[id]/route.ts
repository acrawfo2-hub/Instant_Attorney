import { NextRequest, NextResponse } from "next/server";
import { getClientContext } from "@/lib/client-workspace-auth";

// Edit a consumer freestyle draft in place. A client edit flips source to
// 'client' so a later same-title regeneration doesn't silently overwrite
// hand-written changes.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getClientContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { title, content } = await req.json().catch(() => ({})) as { title?: string; content?: string };

  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), source: "client" };
  if (typeof title === "string") update.title = title.trim() || "Untitled draft";
  if (typeof content === "string") update.content = content;

  const { data, error } = await ctx.db
    .from("client_workspace_drafts")
    .update(update)
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .select()
    .single();

  if (error || !data) {
    console.error("[workspace/drafts] update error:", error);
    return NextResponse.json({ error: "Failed to save draft" }, { status: 500 });
  }
  return NextResponse.json({ draft: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getClientContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const { error } = await ctx.db
    .from("client_workspace_drafts")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) {
    console.error("[workspace/drafts] delete error:", error);
    return NextResponse.json({ error: "Failed to delete draft" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
