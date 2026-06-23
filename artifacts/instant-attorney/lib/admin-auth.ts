/** Shared attorney-gate for /api/admin/* routes. */
import { createClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

/** Returns the attorney's user id, or null if the caller is not a verified attorney. */
export async function getAttorneyUserId(): Promise<string | null> {
  if (BYPASS_AUTH) return BYPASS_USER_ID;
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await db
    .from("profiles").select("is_attorney").eq("id", user.id).single();
  return profile?.is_attorney ? user.id : null;
}
