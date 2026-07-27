import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace-auth";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { stripDraftsForDisplay } from "@/lib/freestyle-drafts";
import type { AttorneyWorkspaceMessage, AttorneyWorkspaceDraft } from "@/lib/types";

export const maxDuration = 120;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 2 });
// Cheap summarizer — organizing notes, not legal reasoning.
const ORGANIZE_MODEL = "claude-haiku-4-5-20251001";

const ORGANIZE_SYSTEM = `You organize an attorney's freestyle work session into a concise working digest for the case file. You are given the attorney's private brainstorm transcript with their AI associate and the titles of any drafts they produced.

Write a tight, skimmable digest (Markdown) the attorney will see next time they open this file. Sections, only those that apply:
- **Where we landed** — the working conclusions / chosen direction.
- **Open questions** — what still needs a decision or a fact.
- **Drafts in progress** — bullet the draft titles and their one-line status.
- **Next moves** — concrete next actions.

Rules: attorney-facing work-product, not client-facing. Be candid and specific to THIS matter. No preamble, no sign-off, no invented facts or citations. If the session was too thin to digest, reply with exactly: NO_DIGEST`;

// Distills the attorney's freestyle session into an organized digest stored on
// the case file — the "updates the Living File" step when they leave the mode.
export async function POST(req: NextRequest) {
  const ctx = await getWorkspaceContext();
  if (!ctx) return NextResponse.json({ error: "Attorney access required" }, { status: 403 });

  const { caseFileId } = await req.json().catch(() => ({})) as { caseFileId?: string };
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  const [{ data: msgRows }, { data: draftRows }] = await Promise.all([
    ctx.db.from("attorney_workspace_messages")
      .select("role, content, created_at")
      .eq("case_file_id", caseFileId)
      .eq("attorney_id", ctx.attorneyId)
      .order("created_at", { ascending: true }),
    ctx.db.from("attorney_workspace_drafts")
      .select("title, updated_at")
      .eq("case_file_id", caseFileId)
      .eq("attorney_id", ctx.attorneyId)
      .order("updated_at", { ascending: false }),
  ]);

  const messages = (msgRows ?? []) as Pick<AttorneyWorkspaceMessage, "role" | "content" | "created_at">[];
  const drafts = (draftRows ?? []) as Pick<AttorneyWorkspaceDraft, "title" | "updated_at">[];

  // Nothing worth digesting — no-op quietly so closing is always cheap/safe.
  if (messages.length < 2) {
    return NextResponse.json({ organized: false, reason: "too_thin" });
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "ATTORNEY" : "ASSOCIATE"}: ${stripDraftsForDisplay(m.content) || m.content}`)
    .join("\n\n");
  const draftList = drafts.length
    ? `\n\nDRAFTS PRODUCED:\n${drafts.map((d) => `- ${d.title}`).join("\n")}`
    : "";

  let digest = "";
  try {
    const result = await anthropic.messages.create({
      model: ORGANIZE_MODEL,
      max_tokens: 1200,
      system: ORGANIZE_SYSTEM,
      messages: [{ role: "user", content: `FREESTYLE TRANSCRIPT:\n\n${transcript}${draftList}` }],
    });
    digest = result.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    await recordAiFromMessage(ctx.db, result, {
      userId: ctx.attorneyId,
      actorId: ctx.attorneyId,
      caseFileId,
      feature: "attorney_chat",
      metadata: { phase: "freestyle_organize" },
    });
  } catch (err) {
    console.error("[workspace/organize] model error:", err);
    return NextResponse.json({ error: "Could not organize session" }, { status: 500 });
  }

  if (!digest || digest === "NO_DIGEST") {
    return NextResponse.json({ organized: false, reason: "no_digest" });
  }

  // Write with the service client — identity is already verified, and this keeps
  // the digest write off any case_files UPDATE RLS policy for attorneys.
  const serviceDb = createServiceClient();
  const { error } = await serviceDb
    .from("case_files")
    .update({
      attorney_workspace_summary: digest,
      attorney_workspace_summarized_at: new Date().toISOString(),
    })
    .eq("id", caseFileId);

  if (error) {
    console.error("[workspace/organize] persist error:", error);
    return NextResponse.json({ error: "Could not save digest" }, { status: 500 });
  }
  return NextResponse.json({ organized: true, digest });
}
