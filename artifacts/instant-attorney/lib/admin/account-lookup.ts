import { createServiceClient } from "@/lib/supabase/server";
import type {
  AccountSnapshot,
  AuthUserFacts,
  ProfileFacts,
  SubscriptionFacts,
} from "@/lib/admin/account-diagnosis";

/**
 * Reads for the People surface.
 *
 * Two rules run through this whole module:
 *
 *  1. **A failed read is data, not an exception.** Every read returns its error
 *     alongside whatever it got, so the console can render "the profiles table
 *     is unreadable" instead of a blank page. `diagnoseAccount` turns those
 *     errors into findings.
 *  2. **Never assume the schema is current.** Optional columns are re-queried
 *     without them when the first attempt fails, because an unapplied migration
 *     must degrade this page, not break it.
 */

const MAX_AUTH_PAGES = 10;
const AUTH_PAGE_SIZE = 200;

export interface AccountMatch {
  userId: string;
  email: string | null;
  fullName: string | null;
  /** True when the account has no profiles row — itself a finding. */
  profileMissing: boolean;
}

export interface AccountSearchResult {
  matches: AccountMatch[];
  /** Non-fatal problems worth showing above the results. */
  warnings: string[];
}

function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/**
 * Find accounts by email or name.
 *
 * Searches the profiles mirror first, then pages auth.users for anything the
 * mirror does not know about. That second pass is not redundant: an account with
 * no profiles row is one of the exact failure modes this page exists to repair,
 * and a profiles-only search would make those accounts unfindable.
 */
export async function searchAccounts(query: string): Promise<AccountSearchResult> {
  const term = query.trim();
  const warnings: string[] = [];
  if (!term) return { matches: [], warnings };

  const db = createServiceClient();
  const byId = new Map<string, AccountMatch>();

  const { data: profiles, error: profileError } = await db
    .from("profiles")
    .select("id, email, full_name")
    .or(`email.ilike.%${term}%,full_name.ilike.%${term}%`)
    .limit(25);

  if (profileError) {
    warnings.push(`Profile search failed: ${profileError.message}`);
  }
  for (const p of profiles ?? []) {
    byId.set(p.id as string, {
      userId: p.id as string,
      email: (p.email as string | null) ?? null,
      fullName: (p.full_name as string | null) ?? null,
      profileMissing: false,
    });
  }

  // Second pass over auth.users. Only worth doing for an email-shaped term —
  // paging the full user list on every keystroke of a name search is not.
  if (term.includes("@")) {
    const needle = term.toLowerCase();
    try {
      for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
        const { data, error } = await db.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
        if (error) {
          warnings.push(`Auth user search failed: ${error.message}`);
          break;
        }
        const users = data?.users ?? [];
        for (const u of users) {
          const email = (u.email ?? "").toLowerCase();
          if (!email.includes(needle) || byId.has(u.id)) continue;
          byId.set(u.id, {
            userId: u.id,
            email: u.email ?? null,
            fullName: (u.user_metadata?.full_name as string | undefined) ?? null,
            profileMissing: true,
          });
        }
        if (users.length < AUTH_PAGE_SIZE) break;
      }
    } catch (e) {
      warnings.push(`Auth user search failed: ${errMessage(e)}`);
    }
  }

  const matches = [...byId.values()].sort((a, b) => {
    // Accounts missing a profile row float to the top — they are the broken ones.
    if (a.profileMissing !== b.profileMissing) return a.profileMissing ? -1 : 1;
    return (a.email ?? "").localeCompare(b.email ?? "");
  });

  return { matches, warnings };
}

async function loadAuthUser(
  db: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<{ facts: AuthUserFacts | null; error: string | null }> {
  try {
    const { data, error } = await db.auth.admin.getUserById(userId);
    if (error) return { facts: null, error: error.message };
    const u = data?.user;
    if (!u) return { facts: null, error: null };
    return {
      facts: {
        id: u.id,
        email: u.email ?? null,
        emailConfirmedAt: u.email_confirmed_at ?? null,
        lastSignInAt: u.last_sign_in_at ?? null,
        // Present on the admin API response but absent from the public typings.
        bannedUntil: (u as { banned_until?: string | null }).banned_until ?? null,
        createdAt: u.created_at ?? null,
      },
      error: null,
    };
  } catch (e) {
    return { facts: null, error: errMessage(e) };
  }
}

/** Columns added after the original schema; absent on a drifted database. */
const PROFILE_OPTIONAL_COLUMNS = "account_type, attorney_user_status";
const PROFILE_CORE_COLUMNS = "id, email, full_name, is_attorney";

async function loadProfile(
  db: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<{ facts: ProfileFacts | null; error: string | null }> {
  const read = async (columns: string) =>
    db.from("profiles").select(columns).eq("id", userId).maybeSingle();

  let { data, error } = await read(`${PROFILE_CORE_COLUMNS}, ${PROFILE_OPTIONAL_COLUMNS}`);
  if (error) {
    // Stage 33 not applied — fall back rather than reporting the account broken.
    ({ data, error } = await read(PROFILE_CORE_COLUMNS));
  }
  if (error) return { facts: null, error: error.message };
  if (!data) return { facts: null, error: null };

  const row = data as unknown as Record<string, unknown>;
  return {
    facts: {
      id: row.id as string,
      email: (row.email as string | null) ?? null,
      fullName: (row.full_name as string | null) ?? null,
      isAttorney: row.is_attorney === true,
      accountType: (row.account_type as string | null) ?? "client",
      attorneyUserStatus: (row.attorney_user_status as string | null) ?? null,
    },
    error: null,
  };
}

const SUBSCRIPTION_CORE_COLUMNS = "status, plan, current_period_end, stripe_customer_id";

async function loadSubscription(
  db: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<{ facts: SubscriptionFacts | null; error: string | null }> {
  const read = async (columns: string) =>
    db.from("subscriptions").select(columns).eq("user_id", userId).maybeSingle();

  // consult_credits is added by a migration that may not have been applied.
  let { data, error } = await read(`${SUBSCRIPTION_CORE_COLUMNS}, consult_credits`);
  if (error) {
    ({ data, error } = await read(SUBSCRIPTION_CORE_COLUMNS));
  }
  if (error) return { facts: null, error: error.message };
  if (!data) return { facts: null, error: null };

  const row = data as unknown as Record<string, unknown>;
  return {
    facts: {
      status: (row.status as string | null) ?? null,
      plan: (row.plan as string | null) ?? null,
      currentPeriodEnd: (row.current_period_end as string | null) ?? null,
      stripeCustomerId: (row.stripe_customer_id as string | null) ?? null,
      consultCredits: (row.consult_credits as number | null) ?? null,
    },
    error: null,
  };
}

/**
 * Assemble everything the console knows about one account. Reads run in
 * parallel and each one's failure is isolated, so a broken profiles table still
 * yields a usable page.
 */
export async function loadAccountSnapshot(userId: string): Promise<AccountSnapshot> {
  const db = createServiceClient();
  const [auth, profile, subscription] = await Promise.all([
    loadAuthUser(db, userId),
    loadProfile(db, userId),
    loadSubscription(db, userId),
  ]);

  return {
    query: auth.facts?.email ?? profile.facts?.email ?? userId,
    authUser: auth.facts,
    profile: profile.facts,
    subscription: subscription.facts,
    authError: auth.error,
    profileError: profile.error,
    subscriptionError: subscription.error,
    capturedAt: new Date().toISOString(),
  };
}

/** Recent audit rows for one account. Empty (with a warning) if stage 47 is unapplied. */
export async function loadAccountAudit(
  userId: string,
  limit = 20
): Promise<{ rows: AdminAuditRow[]; error: string | null }> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("admin_audit_log")
      .select("id, created_at, action, actor_email, actor_via, reason, outcome, error")
      .eq("target_user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as unknown as AdminAuditRow[], error: null };
  } catch (e) {
    return { rows: [], error: errMessage(e) };
  }
}

export interface AccountOverview {
  authUsers: number | null;
  profiles: number | null;
  /** Auth users with no profiles row — the stage-46 §4 population. */
  missingProfiles: AccountMatch[];
  entitled: number | null;
  pendingAttorneySignups: number | null;
  warnings: string[];
}

/**
 * Cheap, whole-population counts for the Overview.
 *
 * `missingProfiles` is the one that earns its keep: an auth user with no
 * profiles row cannot be granted a subscription (the foreign key fails) and
 * reads as a null profile everywhere in the app, and nothing in the product
 * ever surfaces it. Listing them here turns a silent population into a worklist.
 */
export async function loadAccountOverview(): Promise<AccountOverview> {
  const db = createServiceClient();
  const warnings: string[] = [];

  const profileIds = new Set<string>();
  let profiles: number | null = null;
  try {
    const { data, error } = await db.from("profiles").select("id").limit(5000);
    if (error) warnings.push(`Could not count profiles: ${error.message}`);
    else {
      for (const p of data ?? []) profileIds.add(p.id as string);
      profiles = profileIds.size;
    }
  } catch (e) {
    warnings.push(`Could not count profiles: ${errMessage(e)}`);
  }

  let authUsers: number | null = null;
  const missingProfiles: AccountMatch[] = [];
  try {
    let seen = 0;
    for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
      if (error) {
        warnings.push(`Could not list auth users: ${error.message}`);
        break;
      }
      const users = data?.users ?? [];
      seen += users.length;
      if (profiles !== null) {
        for (const u of users) {
          if (!profileIds.has(u.id)) {
            missingProfiles.push({
              userId: u.id,
              email: u.email ?? null,
              fullName: (u.user_metadata?.full_name as string | undefined) ?? null,
              profileMissing: true,
            });
          }
        }
      }
      if (users.length < AUTH_PAGE_SIZE) {
        authUsers = seen;
        break;
      }
    }
    if (authUsers === null && seen > 0) {
      authUsers = seen;
      warnings.push(`Stopped after ${MAX_AUTH_PAGES} pages of auth users — counts may be partial.`);
    }
  } catch (e) {
    warnings.push(`Could not list auth users: ${errMessage(e)}`);
  }

  let entitled: number | null = null;
  try {
    const { count, error } = await db
      .from("subscriptions")
      .select("user_id", { count: "exact", head: true })
      .in("status", ["active", "trialing", "bypass"]);
    if (error) warnings.push(`Could not count subscriptions: ${error.message}`);
    else entitled = count ?? 0;
  } catch (e) {
    warnings.push(`Could not count subscriptions: ${errMessage(e)}`);
  }

  let pendingAttorneySignups: number | null = null;
  try {
    const { count, error } = await db
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("account_type", "attorney_user")
      .eq("attorney_user_status", "pending");
    if (error) warnings.push(`Could not count attorney signups: ${error.message}`);
    else pendingAttorneySignups = count ?? 0;
  } catch (e) {
    warnings.push(`Could not count attorney signups: ${errMessage(e)}`);
  }

  return { authUsers, profiles, missingProfiles, entitled, pendingAttorneySignups, warnings };
}

/** Most recent admin actions across all accounts. */
export async function loadRecentAudit(limit = 15): Promise<{ rows: AdminAuditRow[]; error: string | null }> {
  try {
    const db = createServiceClient();
    const { data, error } = await db
      .from("admin_audit_log")
      .select("id, created_at, action, actor_email, actor_via, reason, outcome, error, target_email, target_user_id")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return { rows: [], error: error.message };
    return { rows: (data ?? []) as unknown as AdminAuditRow[], error: null };
  } catch (e) {
    return { rows: [], error: errMessage(e) };
  }
}

export interface AdminAuditRow {
  id: string;
  created_at: string;
  action: string;
  actor_email: string | null;
  actor_via: string;
  reason: string | null;
  outcome: "ok" | "failed";
  error: string | null;
  target_email?: string | null;
  target_user_id?: string | null;
}
