import { createServiceClient } from "@/lib/supabase/server";
import type { AdminAuthVia } from "@/lib/admin-auth";

/**
 * Append-only trail for every service-role action the admin console takes.
 *
 * This is a law firm: an operator who can set a client's password or confirm
 * their email must leave a record. The trail is also what makes it safe to give
 * those buttons real power in the first place.
 */
export interface AdminAuditEntry {
  actorId: string;
  actorEmail: string | null;
  actorVia: AdminAuthVia;
  /** Stable machine id, e.g. "account.confirm-email". */
  action: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  reason?: string | null;
  /** Anything useful for reconstructing what changed. No secrets, no case content. */
  detail?: Record<string, unknown> | null;
  outcome: "ok" | "failed";
  error?: string | null;
}

/**
 * Record an admin action. Never throws.
 *
 * Returns false when the row could not be written — most likely because stage 47
 * has not been applied yet. Callers surface that to the operator rather than
 * swallowing it: an unaudited privileged action is something you want to know
 * about immediately, and a silently-missing audit trail is the exact class of
 * failure this console exists to eliminate.
 */
export async function recordAdminAction(entry: AdminAuditEntry): Promise<boolean> {
  try {
    const db = createServiceClient();
    const { error } = await db.from("admin_audit_log").insert({
      actor_id: entry.actorId,
      actor_email: entry.actorEmail,
      actor_via: entry.actorVia,
      action: entry.action,
      target_user_id: entry.targetUserId ?? null,
      target_email: entry.targetEmail ?? null,
      reason: entry.reason ?? null,
      detail: entry.detail ?? null,
      outcome: entry.outcome,
      error: entry.error ?? null,
    });
    if (error) {
      console.error(
        `[admin-audit] FAILED to record ${entry.action} by ${entry.actorEmail ?? entry.actorId}: ${error.message}`
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[admin-audit] FAILED to record ${entry.action}:`, e);
    return false;
  }
}
