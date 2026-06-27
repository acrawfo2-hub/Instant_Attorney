import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

async function requireAttorney(): Promise<{ userId: string } | NextResponse> {
  if (BYPASS_AUTH) return { userId: BYPASS_USER_ID };

  const auth = await createClient();
  const { data: { user }, error } = await auth.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { data: profile } = await auth
    .from("profiles")
    .select("is_attorney")
    .eq("id", user.id)
    .single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }
  return { userId: user.id };
}

// Toggle resolved / edit a comment.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;
  const caller = await requireAttorney();
  if (caller instanceof NextResponse) return caller;

  const payload = await req.json().catch(() => ({}));
  const update: { resolved?: boolean; body?: string; updated_at: string } = {
    updated_at: new Date().toISOString(),
  };
  if (typeof payload?.resolved === "boolean") update.resolved = payload.resolved;
  if (typeof payload?.body === "string" && payload.body.trim()) {
    update.body = payload.body.trim();
  }

  const db = createServiceClient();
  const { data: comment, error } = await db
    .from("document_comments")
    .update(update)
    .eq("id", commentId)
    .eq("document_id", id)
    .select("*")
    .single();

  if (error || !comment) {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }
  return NextResponse.json({ comment });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;
  const caller = await requireAttorney();
  if (caller instanceof NextResponse) return caller;

  const db = createServiceClient();
  const { error } = await db
    .from("document_comments")
    .delete()
    .eq("id", commentId)
    .eq("document_id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
