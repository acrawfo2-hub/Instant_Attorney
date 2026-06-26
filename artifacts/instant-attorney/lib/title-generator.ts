import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordAiFromMessage } from "./usage-tracker.ts";

const anthropic = new Anthropic({ apiKey: process.env.Claude_Instant_Attorney, maxRetries: 4 });

export async function generateCaseTitle(
  db: SupabaseClient,
  caseFileId: string,
  summary: string,
  matterType: string | null,
  matterSubtype: string | null
): Promise<void> {
  const context = [
    matterSubtype ? `Matter: ${matterSubtype.replace(/_/g, " ")}` : "",
    matterType ? `Type: ${matterType}` : "",
    summary ? `Summary: ${summary}` : "",
  ].filter(Boolean).join("\n");

  if (!context) return;

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 25,
      messages: [{
        role: "user",
        content: `Generate a 3-6 word descriptive title for this legal matter. Return ONLY the title — no quotes, no punctuation at the end, no explanation.\n\n${context}`,
      }],
    });

    const title = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text.trim())
      .join("")
      .replace(/^["']|["']$/g, "")
      .slice(0, 80);

    if (title) {
      await db.from("case_files").update({ title }).eq("id", caseFileId);
    }

    const { data: caseFile } = await db
      .from("case_files")
      .select("user_id")
      .eq("id", caseFileId)
      .single();

    if (caseFile?.user_id) {
      await recordAiFromMessage(db, response, {
        userId: caseFile.user_id,
        caseFileId,
        feature: "title_generator",
      });
    }
  } catch (err) {
    console.error("[title-generator] error:", err);
  }
}
