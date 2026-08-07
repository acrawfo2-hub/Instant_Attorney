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

/**
 * Does this sign-in failure mean "the account exists but the email was never
 * confirmed"? Supabase returns the typed code on recent versions and the bare
 * message on older ones, so check both.
 */
export function isEmailNotConfirmedError(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  if (error.code === "email_not_confirmed") return true;
  return /email not confirmed/i.test(error.message ?? "");
}

/**
 * Look up an auth user id by email using the service role.
 *
 * Fast path is the `profiles` mirror (populated by the on_auth_user_created
 * trigger), because supabase-js has no getUserByEmail. Falls back to paging
 * the admin user list for accounts that predate the trigger.
 */
async function findAuthUserIdByEmail(email: string): Promise<string | null> {
  const db = createServiceClient();
  const normalized = email.trim().toLowerCase();

  const { data: profile } = await db
    .from("profiles")
    .select("id")
    .ilike("email", normalized)
    .maybeSingle();
  if (profile?.id) return profile.id as string;

  const perPage = 200;
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error || !data?.users?.length) return null;
    const match = data.users.find((u) => (u.email ?? "").toLowerCase() === normalized);
    if (match) return match.id;
    if (data.users.length < perPage) return null;
  }
  return null;
}

/**
 * Confirm an allowlisted tester's email address with the service role.
 *
 * Testers are trusted accounts we provisioned ourselves, so their access must
 * not hinge on transactional email actually landing in an inbox — Supabase's
 * built-in SMTP is rate-limited and confirmation links expire. When a tester
 * hits "Email not confirmed" we flip `email_confirm` server-side and let the
 * sign-in retry succeed. Strictly limited to TESTER_EMAILS; never a general
 * escape hatch. Returns true when the account is now confirmed.
 */
export async function confirmTesterEmail(email: string | null | undefined): Promise<boolean> {
  if (!isTesterEmail(email)) return false;
  try {
    const userId = await findAuthUserIdByEmail(email!);
    if (!userId) return false;
    const db = createServiceClient();
    const { error } = await db.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) {
      console.error("[testers] failed to confirm tester email:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.error("[testers] failed to confirm tester email:", e);
    return false;
  }
}
