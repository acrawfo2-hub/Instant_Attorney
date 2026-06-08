import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { WIZARD_PROMPTS, buildFileContext } from "@/lib/prompts";
import { parseAndUpdateFile } from "@/lib/file-parser";
import { BYPASS_USER_ID } from "@/lib/types";
import type { WizardType, CaseFile, FactItem } from "@/lib/types";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney });
const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export async function POST(req: NextRequest) {
  const { messages, caseFileId, wizardType } = await req.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "Invalid messages" }, { status: 400 });
  }

  if (!wizardType || !WIZARD_PROMPTS[wizardType as WizardType]) {
    return NextResponse.json({ error: "Invalid wizard type" }, { status: 400 });
  }

  if (!caseFileId) {
    return NextResponse.json({ error: "caseFileId required" }, { status: 400 });
  }

  let userId: string;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: sub } = await db
      .from("subscriptions")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle();

    const activeStatuses = ["active", "trialing", "bypass"];
    if (!sub || !activeStatuses.includes(sub.status)) {
      return NextResponse.json({ error: "Subscription required" }, { status: 403 });
    }

    userId = user.id;
  }

  // Load current file state to inject as context
  const [{ data: caseFileRow }, { data: factRows }] = await Promise.all([
    db.from("case_files").select("*").eq("id", caseFileId).single(),
    db.from("fact_items").select("*").eq("case_file_id", caseFileId),
  ]);

  const caseFile = caseFileRow as CaseFile | null;
  const facts = (factRows ?? []) as FactItem[];
  const fileContext = caseFile ? buildFileContext(caseFile, facts) : "";
  const wizardPrompt = WIZARD_PROMPTS[wizardType as WizardType];

  const systemPrompt = fileContext
    ? `${fileContext}\n\n${wizardPrompt}`
    : wizardPrompt;

  const stream = anthropic.messages.stream({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    system: systemPrompt,
    messages,
  });

  const encoder = new TextEncoder();
  let fullResponse = "";

  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            fullResponse += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
      } catch (err) {
        controller.error(err);
      } finally {
        // If wizard is complete, update the Living File with any new facts
        if (fullResponse.includes("---WIZARD COMPLETE---")) {
          try {
            await parseAndUpdateFile(db, caseFileId, userId, fullResponse);
          } catch (parseErr) {
            console.error("[wizard] file parser error:", parseErr);
          }
        }
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
