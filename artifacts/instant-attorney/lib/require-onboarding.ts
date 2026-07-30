import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureTesterSubscription, isTesterEmail } from "@/lib/testers";

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

  const hasActiveSub = !!sub && PHASE2_ACTIVE.includes(sub.status);

  // When an attorney onboards a client, we grant their account a "bypass"
  // subscription so they can drive the client workflow surfaces (chat, wizard,
  // drafting) on files they own. An attorney WITH that active subscription is
  // therefore allowed straight through — bouncing them to /attorney here is what
  // broke "Continue chat" / "Create document" on onboarded client files.
  if (hasActiveSub) return;

  // QA testers are always treated as paid — grant bypass on the fly (safety
  // net if they registered without hitting the login route's grant).
  if (isTesterEmail(user.email)) {
    await ensureTesterSubscription(user.id, user.email);
    return;
  }

  // A subscription-less attorney landed on a Phase II page directly — send them
  // to their review queue, never to "please subscribe."
  if (profile?.is_attorney) {
    redirect("/attorney");
  }

  redirect(profile?.account_type === "attorney_user" ? "/onboarding/attorney" : "/onboarding");
}
