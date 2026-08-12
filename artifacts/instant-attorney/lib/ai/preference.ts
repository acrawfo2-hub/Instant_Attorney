/**
 * Load / validate the user's preferred AI provider from profiles.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  DEFAULT_AI_PROVIDER,
  parseAiProvider,
  type PreferredAiProvider,
} from "@/lib/ai/providers";

export async function loadPreferredAiProvider(
  db: SupabaseClient,
  userId: string
): Promise<PreferredAiProvider> {
  const { data } = await db
    .from("profiles")
    .select("preferred_ai_provider")
    .eq("id", userId)
    .maybeSingle();
  return parseAiProvider(data?.preferred_ai_provider ?? DEFAULT_AI_PROVIDER);
}
