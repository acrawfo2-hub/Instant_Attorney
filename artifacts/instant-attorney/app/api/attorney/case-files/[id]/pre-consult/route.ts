import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { buildPreConsultPrompt } from "@/lib/prompts";
import { recordAiFromMessage } from "@/lib/usage-tracker";
import { BYPASS_USER_ID } from "@/lib/types";
import type { CaseFile, FactItem, Attachment, Document } from "@/lib/types";
import { logTruncation } from "@/lib/truncation-logger";
import { maxOutputTokensFor, limitSignalMetadata } from "@/lib/token-limits";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";
const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney });

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

  const [{ data: caseFileRow }, { data: factRows }, { data: attRows }, { data: docRows }] = await Promise.all([
    db.from("case_files").select("*").eq("id", id).single(),
    db.from("fact_items").select("*").eq("case_file_id", id),
    db.from("attachments").select("*").eq("case_file_id", id).eq("status", "ready"),
    db.from("documents").select("*").eq("case_file_id", id).order("created_at", { ascending: false }),
  ]);

  if (!caseFileRow) return NextResponse.json({ error: "Case file not found" }, { status: 404 });

  const prompt = buildPreConsultPrompt(
    caseFileRow as CaseFile,
    (factRows ?? []) as FactItem[],
    (attRows ?? []) as Attachment[],
    (docRows ?? []) as Document[]
  );

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: maxOutputTokensFor("claude-sonnet-4-6"),
      messages: [{ role: "user", content: prompt }],
    });

    const memo = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    await recordAiFromMessage(db, response, {
      userId: caseFileRow.user_id,
      actorId: userId,
      caseFileId: id,
      feature: "attorney_pre_consult",
      metadata: { ...limitSignalMetadata({
        model: response.model,
        outputTokens: response.usage.output_tokens,
        priorLimit: 4000,
        stopReason: response.stop_reason,
      }) },
    });

    const truncated = response.stop_reason === "max_tokens";
    if (truncated) {
      logTruncation({
        endpoint: "attorney/pre-consult",
        feature: "attorney_pre_consult",
        caseFileId: id,
        userId: caseFileRow.user_id,
        outputTokens: response.usage.output_tokens,
      });
    }

    await db.from("case_files").update({
      pre_consult_memo: memo,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    return NextResponse.json({ pre_consult_memo: memo, truncated });
  } catch (err) {
    console.error("[attorney/pre-consult] error:", err);
    return NextResponse.json({ error: "Memo generation failed" }, { status: 500 });
  }
}
