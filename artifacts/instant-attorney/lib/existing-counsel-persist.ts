import type { SupabaseClient } from "@supabase/supabase-js";
import type { CounselEngagementGoal } from "./types.ts";
import { counselContextFactLine, isValidCounselGoal } from "./existing-counsel.ts";

export interface CounselContextInput {
  has_existing_counsel: boolean;
  unsure?: boolean;
  existing_counsel_name?: string | null;
  counsel_engagement_goal?: CounselEngagementGoal | null;
}

export interface CounselContextPatch {
  counsel_intake_at: string;
  has_existing_counsel: boolean;
  existing_counsel_name: string | null;
  counsel_engagement_goal: CounselEngagementGoal | null;
}

export function buildCounselContextPatch(input: CounselContextInput): CounselContextPatch | { error: string } {
  const hasCounsel = input.has_existing_counsel === true;
  const unsure = input.unsure === true;

  let goal: CounselEngagementGoal | null = null;
  if (hasCounsel && input.counsel_engagement_goal != null) {
    if (!isValidCounselGoal(input.counsel_engagement_goal)) {
      return { error: "Invalid engagement goal" };
    }
    goal = input.counsel_engagement_goal;
  }

  const nameRaw = typeof input.existing_counsel_name === "string" ? input.existing_counsel_name.trim() : "";
  const existingCounselName = hasCounsel && nameRaw ? nameRaw.slice(0, 200) : null;

  if (hasCounsel && !goal) {
    return { error: "Engagement goal required when another attorney is involved" };
  }

  return {
    counsel_intake_at: new Date().toISOString(),
    has_existing_counsel: unsure ? false : hasCounsel,
    existing_counsel_name: hasCounsel ? existingCounselName : null,
    counsel_engagement_goal: hasCounsel ? goal : null,
  };
}

export async function persistCounselContext(
  db: SupabaseClient,
  caseFileId: string,
  userId: string,
  patch: CounselContextPatch,
  hasCounselForFact: boolean
): Promise<{ error?: string }> {
  const { error } = await db.from("case_files").update(patch).eq("id", caseFileId);
  if (error) return { error: "Could not save counsel context." };

  const factLine = counselContextFactLine({
    has_existing_counsel: hasCounselForFact,
    existing_counsel_name: patch.existing_counsel_name,
    counsel_engagement_goal: patch.counsel_engagement_goal,
  });

  if (factLine) {
    const { data: existingFact } = await db
      .from("fact_items")
      .select("id")
      .eq("case_file_id", caseFileId)
      .eq("status", "confirmed")
      .ilike("description", "Prior counsel:%")
      .maybeSingle();

    if (existingFact?.id) {
      await db.from("fact_items").update({ description: factLine }).eq("id", existingFact.id);
    } else {
      await db.from("fact_items").insert({
        case_file_id: caseFileId,
        user_id: userId,
        description: factLine,
        status: "confirmed",
        kind: "fact",
      });
    }
  }

  return {};
}
