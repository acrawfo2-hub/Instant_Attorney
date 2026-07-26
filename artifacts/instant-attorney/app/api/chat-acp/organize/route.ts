import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { syncLivingFile } from "@/lib/living-file-extractor";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { stripDraftsForDisplay } from "@/lib/freestyle-drafts";
import { BYPASS_USER_ID } from "@/lib/types";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 2 });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
// Cheap — a friendly recap, not legal reasoning.
const RECAP_MODEL = "claude-haiku-4-5-20251001";

const RECAP_SYSTEM = `You write a short, warm "here's where we left off" recap for a client, from the tail of their private legal chat. 2–3 sentences, plain language: what you talked through this session and the most useful next thing they can do. Address the client ("you"). No legal advice or guarantees, no sign-off, no invented facts. If the tail is too thin to recap, reply with exactly: NO_RECAP`;

// Consumer "organize on leave": force the Living File to fold in the tail of the
// conversation, then — for a freestyle session with genuinely new content —
// distill a plain-language recap and store it for the client's next visit. Called
// via sendBeacon on page-hide; the digest is debounced so rapid tab switches with
// no new messages don't regenerate it.
export async function POST(req: NextRequest) {
  const { caseFileId, mode } = await req.json().catch(() => ({})) as { caseFileId?: string; mode?: string };
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = user.id;
  }

  const { data: caseFile } = await db.from("case_files").select("user_id").eq("id", caseFileId).maybeSingle();
  if (!caseFile || caseFile.user_id !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Always fold the conversation tail into the Living File first.
  let processed = 0;
  try {
    const result = await syncLivingFile(anthropic, db, caseFileId, userId, { force: true });
    processed = result.processedMessages;
  } catch (err) {
    console.error("[chat-acp/organize] sync error:", err);
  }

  // Recap only for freestyle, and only when the sync actually folded in new
  // content — this is the debounce that keeps page-hide cheap.
  if (mode !== "freestyle" || processed === 0) {
    return NextResponse.json({ organized: true, recap: false });
  }

  try {
    const { data: msgRows } = await db
      .from("intake_messages")
      .select("role, content")
      .eq("case_file_id", caseFileId)
      .order("created_at", { ascending: false })
      .limit(16);
    const messages = ((msgRows ?? []) as { role: string; content: string }[]).reverse();
    if (messages.length < 2) return NextResponse.json({ organized: true, recap: false });

    const transcript = messages
      .map((m) => `${m.role === "user" ? "CLIENT" : "ASSISTANT"}: ${stripDraftsForDisplay(m.content) || m.content}`)
      .join("\n\n");

    const result = await anthropic.messages.create({
      model: RECAP_MODEL,
      max_tokens: 300,
      system: RECAP_SYSTEM,
      messages: [{ role: "user", content: `RECENT CONVERSATION:\n\n${transcript}` }],
    });
    const recap = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text).join("").trim();

    await recordAiFromMessage(db, result, {
      userId, actorId: userId, caseFileId, feature: "matter_synthesis",
      metadata: { phase: "session_recap" },
    });

    if (recap && recap !== "NO_RECAP") {
      await db.from("case_files").update({
        chat_session_summary: recap,
        chat_session_summarized_at: new Date().toISOString(),
      }).eq("id", caseFileId);
      return NextResponse.json({ organized: true, recap: true });
    }
  } catch (err) {
    console.error("[chat-acp/organize] recap error:", err);
  }

  return NextResponse.json({ organized: true, recap: false });
}
