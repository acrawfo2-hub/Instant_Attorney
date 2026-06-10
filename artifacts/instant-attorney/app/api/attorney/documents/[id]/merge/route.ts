import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildMergePrompt } from "@/lib/prompts";
import { BYPASS_USER_ID } from "@/lib/types";
import type { Document } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = BYPASS_AUTH ? createServiceClient() : await createClient();

  let userId: string;
  if (BYPASS_AUTH) {
    userId = BYPASS_USER_ID;
  } else {
    const { data: { user }, error } = await (db as Awaited<ReturnType<typeof createClient>>).auth.getUser();
    if (error || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    userId = user.id;
  }

  const { data: profile } = await db.from("profiles").select("is_attorney").eq("id", userId).single();
  if (!profile?.is_attorney) {
    return NextResponse.json({ error: "Attorney access required" }, { status: 403 });
  }

  const { data: doc } = await db.from("documents").select("*").eq("id", id).single();
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  if (!doc.review_report) {
    return NextResponse.json({ error: "Run document review first" }, { status: 400 });
  }

  await db.from("documents").update({
    review_status: "merging",
    updated_at: new Date().toISOString(),
  }).eq("id", id);

  const prompt = buildMergePrompt(doc as Document, doc.review_report as string);

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const improvedDraft = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    await db.from("documents").update({
      improved_draft_text: improvedDraft,
      review_status: "merged",
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ improved_draft_text: improvedDraft });
  } catch (err) {
    console.error("[attorney/merge] error:", err);
    await db.from("documents").update({
      review_status: "review_ready",
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return NextResponse.json({ error: "Merge generation failed" }, { status: 500 });
  }
}
