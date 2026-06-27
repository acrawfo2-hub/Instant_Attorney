import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Attorney-only comments & concerns attached to a parent document. The attorney
// records notes while reviewing; the second-draft generator folds the open ones
// into its prompt. Never exposed to the client.
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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const caller = await requireAttorney();
  if (caller instanceof NextResponse) return caller;

  const db = createServiceClient();
  const { data: comments, error } = await db
    .from("document_comments")
    .select("*")
    .eq("document_id", id)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load comments" }, { status: 500 });
  }
  return NextResponse.json({ comments: comments ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const caller = await requireAttorney();
  if (caller instanceof NextResponse) return caller;

  const payload = await req.json().catch(() => null);
  const text = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Comment body is required" }, { status: 400 });
  }

  const db = createServiceClient();

  // Confirm the document exists (and is a parent document — comments attach to
  // the top-level draft, not derived children).
  const { data: doc } = await db
    .from("documents")
    .select("id")
    .eq("id", id)
    .is("parent_document_id", null)
    .single();
  if (!doc) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  const { data: comment, error } = await db
    .from("document_comments")
    .insert({ document_id: id, author_id: caller.userId, body: text })
    .select("*")
    .single();

  if (error || !comment) {
    return NextResponse.json({ error: "Failed to add comment" }, { status: 500 });
  }
  return NextResponse.json({ comment });
}
