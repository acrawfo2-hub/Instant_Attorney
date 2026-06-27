import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { MessageSenderRole } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// Direct attorney ⇆ client chat for a single case file. Both the client who
// owns the case and any attorney can read and post here. We verify the caller's
// identity with the RLS-bound session, then read/write through the service
// client so each role can see the *other* side's messages regardless of which
// per-table SELECT policy happens to cover them.
type Caller = { userId: string; role: MessageSenderRole };

async function resolveCaller(
  caseFileId: string
): Promise<Caller | NextResponse> {
  if (BYPASS_AUTH) {
    return { userId: BYPASS_USER_ID, role: "client" };
  }

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

  if (profile?.is_attorney) {
    return { userId: user.id, role: "attorney" };
  }

  // Otherwise the caller must own the case file.
  const db = createServiceClient();
  const { data: ownedCase } = await db
    .from("case_files")
    .select("id")
    .eq("id", caseFileId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!ownedCase) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: user.id, role: "client" };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: caseFileId } = await params;
  const caller = await resolveCaller(caseFileId);
  if (caller instanceof NextResponse) return caller;

  const db = createServiceClient();
  const { data: messages, error } = await db
    .from("case_messages")
    .select("*")
    .eq("case_file_id", caseFileId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }

  // Mark the other side's unread messages as read for this viewer.
  const unreadFromOther = (messages ?? []).filter(
    (m) => m.sender_role !== caller.role && !m.read_at
  );
  if (unreadFromOther.length > 0) {
    await db
      .from("case_messages")
      .update({ read_at: new Date().toISOString() })
      .in("id", unreadFromOther.map((m) => m.id));
  }

  return NextResponse.json({ messages: messages ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: caseFileId } = await params;
  const caller = await resolveCaller(caseFileId);
  if (caller instanceof NextResponse) return caller;

  const body = await req.json().catch(() => null);
  const text = typeof body?.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Message body is required" }, { status: 400 });
  }
  if (text.length > 5000) {
    return NextResponse.json({ error: "Message is too long" }, { status: 400 });
  }

  const db = createServiceClient();

  // Resolve the client who owns the case — every row carries user_id (the owner)
  // so the client RLS policy can match without a recursive case_files subquery.
  const { data: caseFile } = await db
    .from("case_files")
    .select("user_id")
    .eq("id", caseFileId)
    .single();

  if (!caseFile) {
    return NextResponse.json({ error: "Case file not found" }, { status: 404 });
  }

  const { data: message, error } = await db
    .from("case_messages")
    .insert({
      case_file_id: caseFileId,
      user_id: caseFile.user_id,
      sender_id: caller.userId,
      sender_role: caller.role,
      body: text,
    })
    .select("*")
    .single();

  if (error || !message) {
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }

  return NextResponse.json({ message });
}
