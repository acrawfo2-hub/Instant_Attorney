import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

const PHASE2_ACTIVE = ["active", "trialing", "bypass"];

/**
 * Server-only gate for Phase II pages.
 *
 * Call at the top of any server component or layout that requires an active
 * subscription. Redirects to /login if unauthenticated, /onboarding if the
 * user has not subscribed (or the subscription is inactive).
 *
 * Safe no-op when BYPASS_AUTH=true.
 */
export async function requireSubscription(): Promise<void> {
  if (BYPASS_AUTH) return;

  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();

  if (!user) redirect("/login");

  const [{ data: sub }, { data: profile }] = await Promise.all([
    db.from("subscriptions").select("status").eq("user_id", user.id).maybeSingle(),
    db.from("profiles").select("account_type, is_attorney").eq("id", user.id).maybeSingle(),
  ]);

  // The reviewing attorney isn't a paying subscriber — hitting a Phase II
  // page directly should send him to his review queue, never "please subscribe."
  if (profile?.is_attorney) {
    redirect("/attorney");
  }

  if (!sub || !PHASE2_ACTIVE.includes(sub.status)) {
    redirect(profile?.account_type === "attorney_user" ? "/onboarding/attorney" : "/onboarding");
  }
}
