/** Shared attorney-gate for /api/admin/* routes and the /admin console. */
import { createClient } from "@/lib/supabase/server";
import { BYPASS_USER_ID } from "@/lib/types";

const IS_PRODUCTION = process.env.NODE_ENV === "production";

/**
 * BYPASS_AUTH is a local development shortcut. Admin routes hold service-role
 * repair actions over privileged client data, so they refuse to honour it in
 * production no matter how the environment is configured — and say so loudly,
 * because a production deploy carrying BYPASS_AUTH=true is itself an incident.
 */
function bypassAllowed(): boolean {
  if (process.env.BYPASS_AUTH !== "true") return false;
  if (IS_PRODUCTION) {
    console.error(
      "[admin-auth] BYPASS_AUTH=true in production — refusing to honour it. " +
        "Unset it; every /admin request is falling through to real auth."
    );
    return false;
  }
  return true;
}

/**
 * Break-glass allowlist. `ADMIN_EMAILS` is a comma-separated list checked
 * against the signed-in user's own JWT email.
 *
 * Why this exists: the normal gate reads `profiles.is_attorney`, and profile
 * reads are one of the things that break (an RLS policy on profiles that
 * sub-selects profiles produces 42P17 recursion and takes down every profile
 * read — see .agents/memory/instant-attorney-rls-recursion.md). In that state
 * the console would lock you out at exactly the moment you need it to diagnose
 * the outage. This path depends on nothing but the session and an env var.
 *
 * It is a root credential: set it only to addresses that should always have
 * admin, and treat every 'break-glass' row in admin_audit_log as worth a look.
 */
function breakGlassEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** How an admin caller was authorised. Recorded on every audited action. */
export type AdminAuthVia = "profile" | "break-glass" | "bypass";

export interface AdminIdentity {
  userId: string;
  email: string | null;
  via: AdminAuthVia;
}

/**
 * Resolve the calling admin, or null when the caller is not one.
 *
 * Order matters: the authoritative check (profiles.is_attorney) is tried
 * first so the common case records `via: "profile"`. The allowlist is consulted
 * whenever that check does not grant access — including when it *could not run*
 * — which is the whole point of having it.
 */
export async function requireAdmin(): Promise<AdminIdentity | null> {
  if (bypassAllowed()) {
    return { userId: BYPASS_USER_ID, email: null, via: "bypass" };
  }

  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  if (error || !user) return null;

  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("is_attorney")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_attorney) {
    return { userId: user.id, email: user.email ?? null, via: "profile" };
  }

  const email = (user.email ?? "").toLowerCase();
  if (email && breakGlassEmails().includes(email)) {
    console.warn(
      `[admin-auth] break-glass admin access for ${email}` +
        (profileError
          ? ` — the profiles read failed (${profileError.message}), which is itself worth investigating`
          : profile
            ? " — profiles.is_attorney is false for this account"
            : " — this account has no profiles row")
    );
    return { userId: user.id, email: user.email ?? null, via: "break-glass" };
  }

  return null;
}

/**
 * Returns the admin's user id, or null if the caller is not authorised.
 * Thin wrapper over `requireAdmin` kept for the existing /api/admin and
 * /api/attorney call sites.
 */
export async function getAttorneyUserId(): Promise<string | null> {
  return (await requireAdmin())?.userId ?? null;
}
