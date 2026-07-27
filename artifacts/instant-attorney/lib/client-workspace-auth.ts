/** Shared gate for the consumer freestyle /api/workspace/* routes. */
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

/**
 * Resolves the calling client and a Supabase handle. Returns null when
 * unauthenticated. The db handle respects RLS in normal mode (owner-only), and
 * uses the service client only under BYPASS_AUTH. Draft rows are owner-scoped by
 * RLS, so id-addressed routes gate on this plus an explicit user_id filter.
 */
export async function getClientContext(): Promise<{ userId: string; db: Db } | null> {
  if (BYPASS_AUTH) {
    return { userId: BYPASS_USER_ID, db: createServiceClient() };
  }
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return { userId: user.id, db };
}

/**
 * As above, but also verifies the client owns the given case file — used by the
 * case-file-scoped list/create routes.
 */
export async function getClientWorkspaceContext(
  caseFileId: string,
): Promise<{ userId: string; db: Db } | null> {
  const ctx = await getClientContext();
  if (!ctx) return null;

  const { data: caseFile } = await ctx.db
    .from("case_files")
    .select("id")
    .eq("id", caseFileId)
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!caseFile) return null;

  return ctx;
}
