import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { AdminIdentity } from "@/lib/admin-auth";
import { recordAdminAction } from "@/lib/admin/audit";
import {
  REPAIRS,
  validateTempPassword,
  ENTITLED_SUBSCRIPTION_STATUSES,
  type RepairId,
} from "@/lib/admin/account-diagnosis";

/**
 * The repair executors behind the People surface.
 *
 * Each one is the reachable form of something that already existed as
 * hand-pasted SQL (supabase/schema-stage46-auth-access-repair.sql) or an ad-hoc
 * script (scripts/ensure-tester.mjs). Nothing here is a new capability — it is
 * the same power, minus the terminal, plus an audit row.
 */

export const GRANTABLE_PLANS = ["phase2", "consult", "attorney_pro"] as const;
export type GrantablePlan = (typeof GRANTABLE_PLANS)[number];

/** Statuses an operator may grant. A narrower set than what the DB accepts. */
export const GRANTABLE_STATUSES = ["bypass", "active"] as const;
export type GrantableStatus = (typeof GRANTABLE_STATUSES)[number];

const MIN_REASON_LENGTH = 5;

export interface RepairContext {
  admin: AdminIdentity;
  targetUserId: string;
  /** Request origin, used to build the password-reset callback URL. */
  origin: string;
}

export interface RepairInput {
  repair: RepairId;
  reason?: string | null;
  password?: string | null;
  plan?: string | null;
  status?: string | null;
}

export interface RepairOutcome {
  ok: boolean;
  message: string;
  /**
   * The action ran but could not be written to admin_audit_log — almost always
   * an unapplied stage 47. Surfaced rather than swallowed: an unaudited
   * privileged action is something the operator needs to know about now.
   */
  unaudited?: boolean;
}

function errMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

/** Look up the target's email for the audit row. Best-effort; never fatal. */
async function targetEmail(userId: string): Promise<string | null> {
  try {
    const db = createServiceClient();
    const { data } = await db.auth.admin.getUserById(userId);
    return data?.user?.email ?? null;
  } catch {
    return null;
  }
}

/**
 * Validate, execute, and audit one repair.
 *
 * Auditing happens for both outcomes — a failed attempt to set someone's
 * password is at least as interesting as a successful one.
 */
export async function executeRepair(
  ctx: RepairContext,
  input: RepairInput
): Promise<RepairOutcome> {
  const spec = REPAIRS[input.repair];
  if (!spec) return { ok: false, message: `Unknown repair '${input.repair}'.` };

  const reason = (input.reason ?? "").trim();
  if (spec.requiresReason && reason.length < MIN_REASON_LENGTH) {
    return {
      ok: false,
      message: `"${spec.label}" needs a reason of at least ${MIN_REASON_LENGTH} characters — it goes in the audit trail.`,
    };
  }

  const email = await targetEmail(ctx.targetUserId);
  let result: { ok: boolean; message: string; detail?: Record<string, unknown> };

  try {
    result = await runRepair(ctx, input, email);
  } catch (e) {
    result = { ok: false, message: `Repair threw: ${errMessage(e)}` };
  }

  const audited = await recordAdminAction({
    actorId: ctx.admin.userId,
    actorEmail: ctx.admin.email,
    actorVia: ctx.admin.via,
    action: `account.${input.repair}`,
    targetUserId: ctx.targetUserId,
    targetEmail: email,
    reason: reason || null,
    detail: result.detail ?? null,
    outcome: result.ok ? "ok" : "failed",
    error: result.ok ? null : result.message,
  });

  return { ok: result.ok, message: result.message, unaudited: !audited };
}

async function runRepair(
  ctx: RepairContext,
  input: RepairInput,
  email: string | null
): Promise<{ ok: boolean; message: string; detail?: Record<string, unknown> }> {
  const db = createServiceClient();

  switch (input.repair) {
    // ── Confirm the address server-side (generalises confirmTesterEmail) ────
    case "confirm-email": {
      const { error } = await db.auth.admin.updateUserById(ctx.targetUserId, {
        email_confirm: true,
      });
      if (error) return { ok: false, message: `Could not confirm the email: ${error.message}` };
      return { ok: true, message: `${email ?? "The account"} is now confirmed and can sign in.` };
    }

    // ── Lift a repeated-failure ban ─────────────────────────────────────────
    case "clear-lockout": {
      const { error } = await db.auth.admin.updateUserById(ctx.targetUserId, {
        ban_duration: "none",
      });
      if (error) return { ok: false, message: `Could not clear the lockout: ${error.message}` };
      return { ok: true, message: "Lockout cleared — they can attempt sign-in again immediately." };
    }

    // ── Set a password directly (phone support) ─────────────────────────────
    case "set-temp-password": {
      const invalid = validateTempPassword(input.password);
      if (invalid) return { ok: false, message: invalid };
      const { error } = await db.auth.admin.updateUserById(ctx.targetUserId, {
        password: input.password as string,
        // A password set by an operator is only useful if they can then get in.
        email_confirm: true,
      });
      if (error) return { ok: false, message: `Could not set the password: ${error.message}` };
      return {
        ok: true,
        message:
          "Password set. Read it to them directly — never send it by email — and have them change it once they are in.",
        // Never record the password itself, only that one was set.
        detail: { passwordSet: true, emailConfirmed: true },
      };
    }

    // ── Email a recovery link (same flow as /api/auth/forgot-password) ──────
    case "send-reset-link": {
      if (!email) {
        return { ok: false, message: "This account has no email address on file to send to." };
      }
      const anon = await createClient();
      const { error } = await anon.auth.resetPasswordForEmail(email, {
        redirectTo: `${ctx.origin}/api/auth/callback?next=/reset-password`,
      });
      if (error) return { ok: false, message: `Could not send the reset link: ${error.message}` };
      return {
        ok: true,
        message: `Reset link sent to ${email}. Supabase's built-in SMTP is rate-limited and its links expire — if it does not arrive, set a temporary password instead.`,
        detail: { email },
      };
    }

    // ── Backfill the profiles row (stage 46 §4, scoped to one user) ─────────
    case "create-profile": {
      const { data, error: readError } = await db.auth.admin.getUserById(ctx.targetUserId);
      const user = data?.user;
      if (readError || !user) {
        return { ok: false, message: `No auth user to build a profile from: ${readError?.message ?? "not found"}` };
      }

      const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
      const accountType = meta.account_type === "attorney_user" ? "attorney_user" : "client";
      const row: Record<string, unknown> = {
        id: user.id,
        email: user.email,
        full_name: (meta.full_name as string | undefined) ?? "",
        account_type: accountType,
        attorney_user_status: accountType === "attorney_user" ? "pending" : null,
      };

      let { error } = await db.from("profiles").upsert(row, { onConflict: "id" });
      if (error) {
        // Stage 33 columns may not exist on a drifted database — retry with core columns.
        ({ error } = await db
          .from("profiles")
          .upsert({ id: row.id, email: row.email, full_name: row.full_name }, { onConflict: "id" }));
      }
      if (error) return { ok: false, message: `Could not create the profile row: ${error.message}` };
      return {
        ok: true,
        message:
          accountType === "attorney_user"
            ? "Profile created. This is an attorney-user signup, so it now needs approving under Attorney Signups."
            : "Profile created. Grant or repair their subscription next if the app is still locked.",
        detail: { accountType },
      };
    }

    // ── Upsert an entitled subscription (stage 46 §6) ────────────────────────
    case "grant-subscription": {
      const plan = (input.plan ?? "phase2") as GrantablePlan;
      const status = (input.status ?? "bypass") as GrantableStatus;
      if (!(GRANTABLE_PLANS as readonly string[]).includes(plan)) {
        return { ok: false, message: `Plan must be one of ${GRANTABLE_PLANS.join(", ")}.` };
      }
      if (!(GRANTABLE_STATUSES as readonly string[]).includes(status)) {
        return { ok: false, message: `Status must be one of ${GRANTABLE_STATUSES.join(", ")}.` };
      }

      // subscriptions.user_id references profiles(id): without the profile row
      // this fails with a foreign-key violation that reads like a mystery.
      const { data: profile } = await db
        .from("profiles")
        .select("id")
        .eq("id", ctx.targetUserId)
        .maybeSingle();
      if (!profile) {
        return {
          ok: false,
          message:
            "This account has no profiles row, and subscriptions.user_id references it. Run \"Create missing profile row\" first.",
        };
      }

      const { error } = await db.from("subscriptions").upsert(
        {
          user_id: ctx.targetUserId,
          status,
          plan,
          current_period_end: null,
        },
        { onConflict: "user_id" }
      );
      if (error) {
        const hint = /constraint|check/i.test(error.message)
          ? " If this is a check-constraint violation, the database predates the 'bypass' status or the current plan list — apply supabase/schema-stage46-auth-access-repair.sql."
          : /unique|conflict/i.test(error.message)
            ? " If this is an onConflict error, the subscriptions_user_id_unique index is missing — apply supabase/schema-stage46-auth-access-repair.sql."
            : "";
        return { ok: false, message: `Could not grant the subscription: ${error.message}.${hint}` };
      }
      return {
        ok: true,
        message: `Subscription set to ${status} / ${plan}. ${
          (ENTITLED_SUBSCRIPTION_STATUSES as readonly string[]).includes(status)
            ? "The paywall will stop bouncing them."
            : ""
        }`.trim(),
        detail: { plan, status },
      };
    }

    default: {
      const exhaustive: never = input.repair;
      return { ok: false, message: `Unhandled repair '${String(exhaustive)}'.` };
    }
  }
}
