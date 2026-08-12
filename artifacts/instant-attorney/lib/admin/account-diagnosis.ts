/**
 * Pure diagnosis for "why can't this person get in?".
 *
 * Every failure mode enumerated here is one this system has actually produced —
 * see supabase/schema-stage46-auth-access-repair.sql, which is the hand-pasted
 * version of these same repairs.
 *
 * This module is deliberately dependency-free so the rules are unit-testable
 * and so the verdict shown to the operator is computed by exactly the same
 * predicates that decide which repairs to offer. They can never disagree.
 *
 * No imports: lib tests run under node:test, which cannot resolve the `@/`
 * alias anywhere in a test's import graph.
 */

/** Subscription statuses that actually unlock the product. */
export const ENTITLED_SUBSCRIPTION_STATUSES = ["active", "trialing", "bypass"] as const;

/**
 * Repairs the console can execute.
 *
 * Deliberately absent: "sign out everywhere". supabase-js `auth.admin` exposes
 * no per-user session revoke — `signOut()` needs the user's own JWT — so there
 * is no way to implement it here that is guaranteed to work against this
 * project's GoTrue. Setting a temporary password is the credential-rotation
 * tool until that is verified against the live instance.
 */
export type RepairId =
  | "send-reset-link"
  | "set-temp-password"
  | "confirm-email"
  | "create-profile"
  | "grant-subscription"
  | "clear-lockout";

export type Severity = "blocks-signin" | "blocks-app" | "warn" | "info";

export type AccountStatus =
  | "healthy"
  | "blocked-signin"
  | "blocked-app"
  | "no-account"
  | "unknown";

export interface AuthUserFacts {
  id: string;
  email: string | null;
  emailConfirmedAt: string | null;
  lastSignInAt: string | null;
  bannedUntil: string | null;
  createdAt: string | null;
}

export interface ProfileFacts {
  id: string;
  email: string | null;
  fullName: string | null;
  isAttorney: boolean;
  /** 'client' | 'attorney_user' */
  accountType: string | null;
  /** 'pending' | 'approved' | 'rejected' */
  attorneyUserStatus: string | null;
}

export interface SubscriptionFacts {
  status: string | null;
  plan: string | null;
  currentPeriodEnd: string | null;
  stripeCustomerId: string | null;
  consultCredits: number | null;
}

/**
 * Everything the console read about one account. Read *errors* are carried
 * alongside the data rather than thrown: a table that cannot be read is a
 * finding about the system, not an exception that should blank the page.
 */
export interface AccountSnapshot {
  query: string;
  authUser: AuthUserFacts | null;
  profile: ProfileFacts | null;
  subscription: SubscriptionFacts | null;
  authError: string | null;
  profileError: string | null;
  subscriptionError: string | null;
  capturedAt: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  repair?: RepairId;
  /** Memory file explaining the failure mode, when one exists. */
  memo?: string;
}

export interface Diagnosis {
  status: AccountStatus;
  /** One sentence, above the fold. The verdict, not the data. */
  headline: string;
  findings: Finding[];
  /** Repairs to offer, most relevant first. */
  repairs: RepairId[];
}

function isPast(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t < now.getTime();
}

function isFuture(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > now.getTime();
}

/** Does this account bypass the consumer subscription gate entirely? */
function isAttorneySideAccount(profile: ProfileFacts): boolean {
  return profile.isAttorney || profile.accountType === "attorney_user";
}

export function diagnoseAccount(
  snapshot: AccountSnapshot,
  now: Date = new Date()
): Diagnosis {
  const findings: Finding[] = [];
  const { authUser, profile, subscription } = snapshot;

  // ── The read itself failed ───────────────────────────────────────────────
  if (snapshot.authError) {
    return {
      status: "unknown",
      headline: "Could not read this account — the auth lookup failed.",
      findings: [
        {
          id: "auth-read-failed",
          severity: "warn",
          title: "Auth lookup failed",
          detail: snapshot.authError,
        },
      ],
      repairs: [],
    };
  }

  if (!authUser) {
    return {
      status: "no-account",
      headline: `No account exists for ${snapshot.query}.`,
      findings: [
        {
          id: "no-account",
          severity: "blocks-signin",
          title: "No account",
          detail:
            "Nothing in auth.users matches this address. They have never registered, " +
            "or they registered with a different address — check for typos and " +
            "alternate spellings before creating anything.",
        },
      ],
      repairs: [],
    };
  }

  // ── Sign-in blockers ─────────────────────────────────────────────────────
  if (isFuture(authUser.bannedUntil, now)) {
    findings.push({
      id: "locked-out",
      severity: "blocks-signin",
      title: "Account is locked",
      detail: `Banned until ${authUser.bannedUntil}. Supabase applies this after repeated failed sign-ins, and it does not clear on a password reset.`,
      repair: "clear-lockout",
    });
  }

  if (!authUser.emailConfirmedAt) {
    findings.push({
      id: "email-unconfirmed",
      severity: "blocks-signin",
      title: "Email was never confirmed",
      detail:
        "Sign-in fails with 'Email not confirmed'. Supabase's built-in SMTP is " +
        "rate-limited and its links expire, so re-sending often does not help — " +
        "confirming server-side is the reliable fix.",
      repair: "confirm-email",
      memo: ".agents/memory/instant-attorney-tester-allowlist.md",
    });
  }

  // ── Infrastructure findings ──────────────────────────────────────────────
  if (snapshot.profileError) {
    findings.push({
      id: "profile-read-failed",
      severity: "warn",
      title: "Profile read failed",
      detail:
        `${snapshot.profileError}. If this is a 42P17 recursion error, an RLS policy ` +
        "on profiles is sub-selecting profiles and every profile read in the app is " +
        "down — not just this one.",
      memo: ".agents/memory/instant-attorney-rls-recursion.md",
    });
  } else if (!profile) {
    findings.push({
      id: "no-profile",
      severity: "blocks-app",
      title: "No profile row",
      detail:
        "This auth user has no row in profiles — the account predates the " +
        "on_auth_user_created trigger, or the trigger was dropped by a manual auth " +
        "reset. subscriptions.user_id references profiles(id), so granting a " +
        "subscription will fail with a foreign-key violation until this is fixed.",
      repair: "create-profile",
    });
  }

  if (snapshot.subscriptionError) {
    findings.push({
      id: "subscription-read-failed",
      severity: "warn",
      title: "Subscription read failed",
      detail: snapshot.subscriptionError,
    });
  }

  // ── Entitlement ──────────────────────────────────────────────────────────
  if (profile && isAttorneySideAccount(profile)) {
    if (profile.accountType === "attorney_user") {
      if (profile.attorneyUserStatus === "pending") {
        findings.push({
          id: "attorney-pending",
          severity: "blocks-app",
          title: "Attorney signup awaiting approval",
          detail:
            "Nothing unlocks for an attorney-user until the signup is approved. " +
            "Verify the bar number and firm, then approve under Attorney Signups.",
        });
      } else if (profile.attorneyUserStatus === "rejected") {
        findings.push({
          id: "attorney-rejected",
          severity: "blocks-app",
          title: "Attorney signup was rejected",
          detail: "This account was reviewed and rejected. Re-approve under Attorney Signups if that was wrong.",
        });
      }
    }
  } else if (profile && !snapshot.subscriptionError) {
    const status = subscription?.status ?? null;
    const entitled =
      !!status && (ENTITLED_SUBSCRIPTION_STATUSES as readonly string[]).includes(status);

    if (!subscription) {
      findings.push({
        id: "no-subscription",
        severity: "blocks-app",
        title: "No subscription row",
        detail:
          "Every gated page bounces this account to the Stripe paywall. If they have " +
          "paid, the checkout or webhook did not land; if they are a tester or a comp, " +
          "grant a bypass.",
        repair: "grant-subscription",
      });
    } else if (!entitled) {
      findings.push({
        id: "subscription-inactive",
        severity: "blocks-app",
        title: `Subscription is '${status}'`,
        detail:
          `Only ${ENTITLED_SUBSCRIPTION_STATUSES.join(", ")} unlock the product, so this ` +
          "account is being sent to the paywall.",
        repair: "grant-subscription",
      });
    } else if (status !== "bypass" && isPast(subscription.currentPeriodEnd, now)) {
      findings.push({
        id: "subscription-period-lapsed",
        severity: "warn",
        title: "Billing period has ended",
        detail:
          `Status is still '${status}' but current_period_end (${subscription.currentPeriodEnd}) ` +
          "is in the past. Stripe may have stopped sending webhooks — check the Stripe " +
          "customer before assuming this account is paid up.",
      });
    }
  }

  // ── Informational ────────────────────────────────────────────────────────
  if (profile && authUser.email && profile.email && profile.email.toLowerCase() !== authUser.email.toLowerCase()) {
    findings.push({
      id: "email-drift",
      severity: "warn",
      title: "Profile email does not match the login email",
      detail:
        `Signs in as ${authUser.email}; the profiles mirror says ${profile.email}. ` +
        "Anything that looks the account up by profile email — including this search — " +
        "will miss it.",
    });
  }

  if (!authUser.lastSignInAt) {
    findings.push({
      id: "never-signed-in",
      severity: "info",
      title: "Has never signed in",
      detail: "The account exists but no successful sign-in has ever been recorded.",
    });
  }

  // ── Verdict ──────────────────────────────────────────────────────────────
  const blockers = findings.filter((f) => f.severity === "blocks-signin");
  const appBlockers = findings.filter((f) => f.severity === "blocks-app");

  let status: AccountStatus = "healthy";
  let headline = "Healthy — can sign in and use the app.";

  if (blockers.length > 0) {
    status = "blocked-signin";
    headline = `Cannot sign in. ${blockers.map((f) => f.title).join("; ")}.`;
  } else if (appBlockers.length > 0) {
    status = "blocked-app";
    headline = `Signs in, but the app is locked. ${appBlockers.map((f) => f.title).join("; ")}.`;
  }

  return { status, headline, findings, repairs: repairsFor(findings) };
}

/**
 * Which repairs to offer, most relevant first.
 *
 * Findings contribute their own repair; the two credential tools are always
 * available while the auth user exists, because "they're on the phone and can't
 * get in" does not always come with a diagnosable finding.
 */
function repairsFor(findings: Finding[]): RepairId[] {
  const ordered: RepairId[] = [];
  const add = (id: RepairId) => {
    if (!ordered.includes(id)) ordered.push(id);
  };

  for (const f of findings) {
    if (f.repair) add(f.repair);
  }
  add("send-reset-link");
  add("set-temp-password");
  return ordered;
}

export interface RepairSpec {
  id: RepairId;
  label: string;
  description: string;
  /** Destructive or credential-changing: the UI demands a typed reason. */
  requiresReason: boolean;
  /** Needs a password value from the operator. */
  requiresPassword?: boolean;
  /** Needs a plan choice from the operator. */
  requiresPlan?: boolean;
}

export const REPAIRS: Record<RepairId, RepairSpec> = {
  "confirm-email": {
    id: "confirm-email",
    label: "Force-confirm email",
    description:
      "Marks the address confirmed server-side so sign-in stops failing with " +
      "'Email not confirmed'. Use when the confirmation mail never arrived or expired.",
    requiresReason: true,
  },
  "create-profile": {
    id: "create-profile",
    label: "Create missing profile row",
    description:
      "Backfills the profiles row from the auth user's metadata, the way the " +
      "on_auth_user_created trigger would have. Safe and idempotent.",
    requiresReason: false,
  },
  "grant-subscription": {
    id: "grant-subscription",
    label: "Grant / repair subscription",
    description:
      "Upserts an entitled subscription row so the paywall stops bouncing them. " +
      "Use 'bypass' for testers and comps; use 'active' only when Stripe really did collect.",
    requiresReason: true,
    requiresPlan: true,
  },
  "clear-lockout": {
    id: "clear-lockout",
    label: "Clear lockout",
    description: "Lifts the Supabase ban applied after repeated failed sign-ins.",
    requiresReason: false,
  },
  "send-reset-link": {
    id: "send-reset-link",
    label: "Send password reset link",
    description:
      "Emails a recovery link. Prefer this when their inbox is working — it leaves " +
      "the password known only to them.",
    requiresReason: false,
  },
  "set-temp-password": {
    id: "set-temp-password",
    label: "Set a temporary password",
    description:
      "Sets a password directly and signs the account out everywhere. For phone " +
      "support, or when email itself is the broken thing. Read it out, never send it by email.",
    requiresReason: true,
    requiresPassword: true,
  },
};

/** Minimum password length accepted for a temporary password. */
export const MIN_TEMP_PASSWORD_LENGTH = 12;

export function validateTempPassword(password: unknown): string | null {
  if (typeof password !== "string" || password.length < MIN_TEMP_PASSWORD_LENGTH) {
    return `Temporary password must be at least ${MIN_TEMP_PASSWORD_LENGTH} characters.`;
  }
  return null;
}
