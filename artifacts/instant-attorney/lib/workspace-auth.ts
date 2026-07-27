/** Shared attorney-gate for the freestyle /api/attorney/workspace/* routes. */
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Resolves the calling attorney and a Supabase handle. Returns null when the
 * caller is not a verified attorney. The db handle respects RLS in normal mode
 * (so a route can only ever touch the attorney's own work-product rows) and
 * uses the service client only under BYPASS_AUTH.
 */
export async function getWorkspaceContext(): Promise<{ attorneyId: string; db: Db } | null> {
  if (BYPASS_AUTH) {
    return { attorneyId: BYPASS_USER_ID, db: createServiceClient() };
  }
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  const { data: profile } = await db
    .from("profiles").select("is_attorney").eq("id", user.id).single();
  if (!profile?.is_attorney) return null;
  return { attorneyId: user.id, db };
}
