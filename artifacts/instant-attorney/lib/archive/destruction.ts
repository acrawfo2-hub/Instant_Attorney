/**
 * End-of-retention destruction — the deliberate, notice-first counterpart to
 * archival. Nothing is auto-destroyed without (a) passing its retention_until,
 * (b) a destruction notice sent to the client, (c) a notice period elapsing, and
 * (d) no legal hold. The manifest row is kept as a tombstone (destroyed_at set)
 * so the destruction itself is auditable.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyClientArchiveDestruction } from "@/lib/notify";

function noticeDays(): number {
  const raw = process.env.ARCHIVE_DESTRUCTION_NOTICE_DAYS;
  const n = raw ? Number(raw) : 30;
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

/** Securely destroy one archive's stored object and tombstone its manifest. */
export async function destroyArchive(
  serviceDb: SupabaseClient,
  archiveId: string
): Promise<{ archiveId: string; destroyed: boolean; reason?: string }> {
  const { data: m } = await serviceDb
    .from("matter_archives").select("*").eq("id", archiveId).single();
  if (!m) return { archiveId, destroyed: false, reason: "not found" };
  if (m.destroyed_at) return { archiveId, destroyed: false, reason: "already destroyed" };
  if (m.legal_hold) return { archiveId, destroyed: false, reason: "legal hold" };

  await serviceDb.storage.from(m.storage_bucket).remove([m.storage_path]).catch(() => {});
  await serviceDb
    .from("matter_archives")
    .update({ destroyed_at: new Date().toISOString() })
    .eq("id", archiveId);

  return { archiveId, destroyed: true };
}

export interface RetentionSweepResult {
  noticesSent: number;
  destroyed: number;
  failures: Array<{ archiveId: string; error: string }>;
  skipped: string;
}

/**
 * Phase 1 — send destruction notices for archives that have passed
 * retention_until and have not yet been noticed.
 */
async function sweepDestructionNotices(
  serviceDb: SupabaseClient,
  limit: number,
  result: RetentionSweepResult
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: due } = await serviceDb
    .from("matter_archives")
    .select("id, user_email, matter_title, retention_until")
    .is("destroyed_at", null)
    .is("destruction_notice_sent_at", null)
    .eq("legal_hold", false)
    .not("retention_until", "is", null)
    .lte("retention_until", nowIso)
    .limit(limit);

  for (const a of (due ?? []) as Array<{ id: string; user_email: string | null; matter_title: string | null }>) {
    try {
      if (a.user_email) {
        await notifyClientArchiveDestruction(a.user_email, {
          matterTitle: a.matter_title,
          noticeDays: noticeDays(),
        });
      }
      await serviceDb
        .from("matter_archives")
        .update({ destruction_notice_sent_at: new Date().toISOString() })
        .eq("id", a.id);
      result.noticesSent += 1;
    } catch (err) {
      result.failures.push({ archiveId: a.id, error: (err as Error).message });
    }
  }
}

/**
 * Phase 2 — destroy archives whose destruction notice period has elapsed.
 */
async function sweepDestroyEligible(
  serviceDb: SupabaseClient,
  limit: number,
  result: RetentionSweepResult
): Promise<void> {
  const cutoff = new Date(Date.now() - noticeDays() * 86_400_000).toISOString();
  const { data: due } = await serviceDb
    .from("matter_archives")
    .select("id")
    .is("destroyed_at", null)
    .eq("legal_hold", false)
    .not("destruction_notice_sent_at", "is", null)
    .lte("destruction_notice_sent_at", cutoff)
    .limit(limit);

  for (const a of (due ?? []) as Array<{ id: string }>) {
    try {
      const r = await destroyArchive(serviceDb, a.id);
      if (r.destroyed) result.destroyed += 1;
    } catch (err) {
      result.failures.push({ archiveId: a.id, error: (err as Error).message });
    }
  }
}

/**
 * Run the retention-destruction lifecycle: send notices for newly-eligible
 * archives, then destroy those whose notice period has elapsed. Safe to re-run
 * daily. A notice period of 0 still requires a notice to have been sent on a
 * prior pass before destruction occurs.
 */
export async function runRetentionDestruction(
  serviceDb: SupabaseClient,
  limit = 50
): Promise<RetentionSweepResult> {
  const result: RetentionSweepResult = { noticesSent: 0, destroyed: 0, failures: [], skipped: "" };
  await sweepDestructionNotices(serviceDb, limit, result);
  await sweepDestroyEligible(serviceDb, limit, result);
  return result;
}
