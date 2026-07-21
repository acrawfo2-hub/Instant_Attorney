import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

export interface Viewer {
  /** Service-role client — bypasses RLS, for reads/writes after the check below. */
  db: SupabaseClient;
  userId: string;
  isAttorney: boolean;
}

/**
 * Resolves the signed-in user and whether they're an attorney, honoring
 * BYPASS_AUTH the same way every attorney page/route in this app already
 * does inline. Does not redirect on its own — callers decide what "not an
 * attorney" means for their page (redirect home, notFound, 403, etc.), since
 * that varies (e.g. a consult session is also valid for the client, just in
 * a different mode).
 */
export async function requireViewer(): Promise<Viewer> {
  if (BYPASS_AUTH) {
    return { db: createServiceClient(), userId: BYPASS_USER_ID, isAttorney: true };
  }

  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await auth
    .from("profiles")
    .select("is_attorney")
    .eq("id", user.id)
    .single();

  return { db: createServiceClient(), userId: user.id, isAttorney: profile?.is_attorney ?? false };
}

/** Same resolution as requireViewer(), for API route handlers (401 JSON instead of a page redirect). */
export async function requireViewerForRoute(): Promise<Viewer | NextResponse> {
  if (BYPASS_AUTH) {
    return { db: createServiceClient(), userId: BYPASS_USER_ID, isAttorney: true };
  }

  const auth = await createClient();
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await auth
    .from("profiles")
    .select("is_attorney")
    .eq("id", user.id)
    .single();

  return { db: createServiceClient(), userId: user.id, isAttorney: profile?.is_attorney ?? false };
}
