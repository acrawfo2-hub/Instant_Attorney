import { NextRequest, NextResponse } from "next/server";
import { requireViewerForRoute } from "@/lib/auth/require-attorney";

// Attorney-only notepad entries for a live consult session. Not exposed to
// the client — see schema-stage32-consult-session.sql.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: notes, error } = await viewer.db
    .from("consult_notes")
    .select("*")
    .eq("consult_request_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: "Failed to load notes" }, { status: 500 });
  return NextResponse.json({ notes: notes ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const viewer = await requireViewerForRoute();
  if (viewer instanceof NextResponse) return viewer;
  if (!viewer.isAttorney) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const payload = await req.json().catch(() => null);
  const text = typeof payload?.body === "string" ? payload.body.trim() : "";
  if (!text) return NextResponse.json({ error: "Note body is required" }, { status: 400 });

  const { data: consult } = await viewer.db
    .from("consult_requests")
    .select("id")
    .eq("id", id)
    .single();
  if (!consult) return NextResponse.json({ error: "Consult request not found" }, { status: 404 });

  const { data: note, error } = await viewer.db
    .from("consult_notes")
    .insert({ consult_request_id: id, author_id: viewer.userId, body: text })
    .select("*")
    .single();

  if (error || !note) return NextResponse.json({ error: "Failed to add note" }, { status: 500 });
  return NextResponse.json({ note });
}
