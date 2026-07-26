import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { getClientWorkspaceContext } from "@/lib/client-workspace-auth";
import { loadMatterTasks, formatMatterTasks } from "@/lib/matter-assessment";
import { recordAiFromMessage } from "@/lib/usage-tracker";

export const maxDuration = 60;

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 2 });
// Cheap — phrasing a list, not reasoning about the law.
const SYNTH_MODEL = "claude-haiku-4-5-20251001";

const SYNTH_SYSTEM = `You write a short, plain-language "here's where your matter stands" note for a client, from a pre-computed, prioritized task list. You are given three buckets: DOABLE NOW, BLOCKED (waiting on a fact, document, or external step), and DONE.

Write 2–4 short sentences (or a few tight bullets) that orient the client: what they can do right now that matters most, what's waiting and on what, and acknowledge what's already handled. Lead with the most urgent/high-impact doable item.

Hard rules: use ONLY the tasks you are given — never invent a task, deadline, or fact. No legal advice or guarantees. No sign-off. If every bucket is empty, reply exactly: NOTHING_YET`;

// "State of your matter" synthesizer (plan Phase 1). Returns the deterministic
// bucketed task list plus a short grounded narrative. The buckets are the source
// of truth; the narrative only phrases them.
export async function POST(req: NextRequest) {
  const { caseFileId } = await req.json().catch(() => ({})) as { caseFileId?: string };
  if (!caseFileId) return NextResponse.json({ error: "caseFileId required" }, { status: 400 });

  const ctx = await getClientWorkspaceContext(caseFileId);
  if (!ctx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tasks = await loadMatterTasks(ctx.db, caseFileId);
  if (!tasks) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Grounded narrative — best-effort; the buckets return regardless.
  let narrative = "";
  const total = tasks.counts.done + tasks.counts.doableNow + tasks.counts.blocked;
  if (total > 0) {
    const payload = formatMatterTasks(tasks);

    try {
      const result = await anthropic.messages.create({
        model: SYNTH_MODEL,
        max_tokens: 400,
        system: SYNTH_SYSTEM,
        messages: [{ role: "user", content: payload }],
      });
      const text = result.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text).join("").trim();
      narrative = text === "NOTHING_YET" ? "" : text;

      await recordAiFromMessage(ctx.db, result, {
        userId: ctx.userId,
        actorId: ctx.userId,
        caseFileId,
        feature: "matter_synthesis",
      });
    } catch (err) {
      console.error("[assess-matter] narrative error:", err);
    }
  }

  return NextResponse.json({ ...tasks, narrative });
}
