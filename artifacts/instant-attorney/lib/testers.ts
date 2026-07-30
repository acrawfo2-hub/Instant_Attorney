import { createServiceClient } from "@/lib/supabase/server";

/**
 * QA tester allowlist. These accounts are always treated as fully paid
 * (phase2, status "bypass") — no Stripe checkout required. On login (and as a
 * safety net on any subscription-gated page), we upsert a bypass subscription
 * row so every existing status check in the app passes naturally.
 */
export const TESTER_EMAILS = ["vicky.crawford12@gmail.com"];

export function isTesterEmail(email: string | null | undefined): boolean {
  return !!email && TESTER_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * Ensure a tester has an always-paid subscription row. No-op for non-testers
 * or when the row already carries an active/bypass status. Never throws —
 * a failure here must not block login.
 */
export async function ensureTesterSubscription(
  userId: string,
  email: string | null | undefined
): Promise<void> {
  if (!isTesterEmail(email)) return;
  try {
    const db = createServiceClient();
    const { data: existing } = await db
      .from("subscriptions")
      .select("status")
      .eq("user_id", userId)
      .maybeSingle();
    if (existing && ["active", "trialing", "bypass"].includes(existing.status)) return;
    await db.from("subscriptions").upsert(
      {
        user_id: userId,
        status: "bypass",
        plan: "phase2",
        current_period_end: null,
      },
      { onConflict: "user_id" }
    );
  } catch (e) {
    console.error("[testers] failed to grant bypass subscription:", e);
  }
}
