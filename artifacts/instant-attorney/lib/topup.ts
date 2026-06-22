/**
 * Automatic token top-up engine.
 *
 * Flow:
 *   1. Every billable AI usage event calls `accrueUsage()`, which draws down the
 *      monthly included allowance and adds the remainder to a per-customer
 *      `meter_usd` (COGS since the last successful top-up).
 *   2. When `meter_usd` crosses the configured threshold, a single off-session
 *      Stripe PaymentIntent is created and the ledger is moved to `pending`.
 *   3. On success the meter is reduced by exactly the threshold (overshoot is
 *      carried forward) and a fresh cycle begins. On failure the ledger is
 *      `blocked` and the pre-call gate stops further AI spend until paid.
 *
 * Idempotency has three layers: a conditional ledger claim (status ok→pending),
 * a unique (user_id, cycle_id) row in `top_up_charges`, and a Stripe
 * idempotency key derived from the cycle id.
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";
import { createServiceClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { getBillingConfig } from "@/lib/billing-config";

const BYPASS_AUTH = process.env.BYPASS_AUTH === "true";

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

interface LedgerRow {
  user_id: string;
  meter_usd: number;
  status: "ok" | "pending" | "blocked";
  cycle_id: string;
  allowance_used_usd: number;
  allowance_period_start: string;
  total_topups: number;
  total_topup_usd: number;
  monthly_topup_limit_usd: number | null;
  month_topup_usd: number;
  block_reason: "limit_reached" | "topup_failed" | null;
}

export type BlockReason = "topup_pending" | "topup_failed" | "limit_reached";

export interface BillingGate {
  allowed: boolean;
  /** Only set when allowed is false. */
  reason?: BlockReason;
  status: "ok" | "pending" | "blocked" | "exempt" | "disabled";
  meterUsd: number;
  thresholdUsd: number;
}

/** Everything the customer-facing billing UI needs in one read. */
export interface BillingSummary {
  enabled: boolean;
  exempt: boolean;
  status: "ok" | "pending" | "blocked" | "exempt" | "disabled";
  blockReason: BlockReason | null;
  allowed: boolean;
  meterUsd: number;
  thresholdUsd: number;
  chargeUsd: number;
  /** USD of usage remaining before the next automatic top-up fires. */
  untilNextTopUpUsd: number;
  monthlyLimitUsd: number;
  monthTopUpUsd: number;
  /** USD of pre-approved top-up budget left this month. */
  monthlyRemainingUsd: number;
  /** True when the next top-up would exceed the monthly limit. */
  nextTopUpExceedsLimit: boolean;
  hasPaymentMethod: boolean;
  lifetimeTopUps: number;
  lifetimeTopUpUsd: number;
}

function currentMonthStartISO(): string {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString();
}

function monthRolled(ledger: LedgerRow): boolean {
  return (
    new Date(ledger.allowance_period_start).getTime() <
    new Date(currentMonthStartISO()).getTime()
  );
}

/** Month-to-date top-up spend, treating a rolled-over month as $0. */
function effectiveMonthSpend(ledger: LedgerRow): number {
  return monthRolled(ledger) ? 0 : Number(ledger.month_topup_usd);
}

/** Monthly allowance consumed, treating a rolled-over month as $0. */
function effectiveAllowanceUsed(ledger: LedgerRow): number {
  return monthRolled(ledger) ? 0 : Number(ledger.allowance_used_usd);
}

function limitFor(ledger: LedgerRow, cfg: ReturnType<typeof getBillingConfig>): number {
  return ledger.monthly_topup_limit_usd === null
    ? cfg.defaultMonthlyLimitUsd
    : Number(ledger.monthly_topup_limit_usd);
}

/** True when this user should never be metered, charged, or blocked. */
export async function isBillingExempt(
  serviceDb: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data } = await serviceDb
    .from("profiles")
    .select("billing_exempt")
    .eq("id", userId)
    .maybeSingle();
  return data?.billing_exempt === true;
}

async function loadLedger(
  serviceDb: SupabaseClient,
  userId: string
): Promise<LedgerRow> {
  const { data } = await serviceDb
    .from("top_up_ledger")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (data) return data as LedgerRow;

  const { data: created } = await serviceDb
    .from("top_up_ledger")
    .insert({ user_id: userId })
    .select()
    .single();
  return created as LedgerRow;
}

/**
 * Add one billable AI event's COGS to the customer's ledger and trigger a
 * top-up if the threshold is crossed. Never throws — billing must not break
 * the AI request that produced the usage.
 */
export async function accrueUsage(userId: string, costUsd: number): Promise<void> {
  if (costUsd <= 0) return;
  const cfg = getBillingConfig();
  if (!cfg.enabled) return;

  try {
    const serviceDb = createServiceClient();
    if (await isBillingExempt(serviceDb, userId)) return;

    const ledger = await loadLedger(serviceDb, userId);
    const rolled = monthRolled(ledger);
    const periodStart = rolled ? currentMonthStartISO() : ledger.allowance_period_start;
    const allowanceUsed = effectiveAllowanceUsed(ledger);

    // Draw from the monthly included allowance first; only the overflow meters.
    const allowanceRemaining = Math.max(0, cfg.includedAllowanceUsd - allowanceUsed);
    const drawnFromAllowance = Math.min(allowanceRemaining, costUsd);
    const meterDelta = costUsd - drawnFromAllowance;
    const newMeter = roundUsd(Number(ledger.meter_usd) + meterDelta);

    await serviceDb
      .from("top_up_ledger")
      .update({
        meter_usd: newMeter,
        allowance_used_usd: roundUsd(allowanceUsed + drawnFromAllowance),
        allowance_period_start: periodStart,
        // Reset month-to-date top-up spend when the calendar month rolls over.
        month_topup_usd: rolled ? 0 : Number(ledger.month_topup_usd),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    if (newMeter >= cfg.thresholdUsd && ledger.status === "ok") {
      await triggerTopUp(serviceDb, { ...ledger, meter_usd: newMeter });
    }
  } catch (err) {
    console.error("[topup] accrueUsage error:", err);
  }
}

/** Claim the cycle and create the off-session charge. Safe under concurrency. */
async function triggerTopUp(serviceDb: SupabaseClient, ledger: LedgerRow): Promise<void> {
  const cfg = getBillingConfig();
  const cycleId = ledger.cycle_id;

  // Spending-limit gate: if this top-up would push month-to-date top-up spend
  // past the user's pre-approved cap, pause instead of charging. The user must
  // raise their limit (re-approve) to continue — no surprise overcharge.
  const monthSpend = effectiveMonthSpend(ledger);
  const limit = limitFor(ledger, cfg);
  if (monthSpend + cfg.chargeUsd > limit + 1e-9) {
    const { data: paused } = await serviceDb
      .from("top_up_ledger")
      .update({
        status: "blocked",
        block_reason: "limit_reached",
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", ledger.user_id)
      .eq("status", "ok")
      .eq("cycle_id", cycleId)
      .select();
    if (paused && paused.length > 0) {
      // Audit row; meter is intentionally left intact so the charge can still
      // fire once the user raises their limit.
      await serviceDb.from("top_up_charges").insert({
        user_id: ledger.user_id,
        cycle_id: cycleId,
        amount_usd: cfg.chargeUsd,
        cogs_at_trigger_usd: ledger.meter_usd,
        status: "skipped",
        failure_reason: "limit_reached",
      });
    }
    return;
  }

  // Layer 1: conditional claim. Only one concurrent caller flips ok→pending.
  const { data: claimed } = await serviceDb
    .from("top_up_ledger")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .eq("user_id", ledger.user_id)
    .eq("status", "ok")
    .eq("cycle_id", cycleId)
    .select();

  if (!claimed || claimed.length === 0) return; // lost the race — already claimed

  // Layer 2: unique (user_id, cycle_id) charge row.
  const { data: charge, error: chargeErr } = await serviceDb
    .from("top_up_charges")
    .insert({
      user_id: ledger.user_id,
      cycle_id: cycleId,
      amount_usd: cfg.chargeUsd,
      cogs_at_trigger_usd: ledger.meter_usd,
      status: "pending",
    })
    .select()
    .single();

  if (chargeErr || !charge) return; // unique violation — charge already exists

  // Dev / no-Stripe path: simulate a successful top-up so local flows continue.
  if (BYPASS_AUTH) {
    await serviceDb
      .from("top_up_charges")
      .update({ status: "skipped", settled_at: new Date().toISOString() })
      .eq("id", charge.id);
    await applySuccessfulTopUp(serviceDb, ledger.user_id, cfg.chargeUsd, cfg.thresholdUsd);
    return;
  }

  await chargeViaStripe(serviceDb, ledger.user_id, cycleId, charge.id);
}

interface ChargeContext {
  customerId: string;
  paymentMethodId: string;
}

/** Resolve the customer's saved default card for an off-session charge. */
async function resolvePaymentContext(
  serviceDb: SupabaseClient,
  userId: string
): Promise<ChargeContext | { error: string }> {
  const { data: sub } = await serviceDb
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const customerId = sub?.stripe_customer_id;
  if (!customerId) return { error: "no_customer" };

  const stripe = getStripe();
  const customer = await stripe.customers.retrieve(customerId);
  if (customer.deleted) return { error: "customer_deleted" };

  let pmId =
    typeof customer.invoice_settings?.default_payment_method === "string"
      ? customer.invoice_settings.default_payment_method
      : customer.invoice_settings?.default_payment_method?.id;

  if (!pmId) {
    const cards = await stripe.paymentMethods.list({
      customer: customerId,
      type: "card",
      limit: 1,
    });
    pmId = cards.data[0]?.id;
  }

  if (!pmId) return { error: "no_payment_method" };
  return { customerId, paymentMethodId: pmId };
}

async function chargeViaStripe(
  serviceDb: SupabaseClient,
  userId: string,
  cycleId: string,
  chargeId: string
): Promise<void> {
  const cfg = getBillingConfig();
  const ctx = await resolvePaymentContext(serviceDb, userId);

  if ("error" in ctx) {
    await markTopUpFailed(serviceDb, chargeId, userId, ctx.error);
    return;
  }

  try {
    const intent = await getStripe().paymentIntents.create(
      {
        amount: Math.round(cfg.chargeUsd * 100),
        currency: "usd",
        customer: ctx.customerId,
        payment_method: ctx.paymentMethodId,
        off_session: true,
        confirm: true,
        description: "Instant Attorney — token usage top-up",
        metadata: {
          type: "token_topup",
          user_id: userId,
          cycle_id: cycleId,
          product_id: cfg.productId,
        },
      },
      { idempotencyKey: `topup_${cycleId}` } // Layer 3: Stripe-side idempotency
    );

    await serviceDb
      .from("top_up_charges")
      .update({ stripe_payment_intent_id: intent.id })
      .eq("id", chargeId);

    // PaymentIntents confirmed off-session usually settle synchronously; the
    // webhook is the authoritative path and is idempotent with this one.
    if (intent.status === "succeeded") {
      await settleTopUpSuccessById(serviceDb, chargeId);
    }
  } catch (err) {
    const reason =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: unknown }).code)
        : "charge_error";
    await markTopUpFailed(serviceDb, chargeId, userId, reason);
  }
}

/** Idempotent: reduce the meter by the threshold and open a fresh cycle. */
async function applySuccessfulTopUp(
  serviceDb: SupabaseClient,
  userId: string,
  amountUsd: number,
  thresholdUsd: number
): Promise<void> {
  const ledger = await loadLedger(serviceDb, userId);
  const carried = roundUsd(Math.max(0, Number(ledger.meter_usd) - thresholdUsd));
  const rolled = monthRolled(ledger);
  await serviceDb
    .from("top_up_ledger")
    .update({
      meter_usd: carried,
      status: "ok",
      block_reason: null,
      cycle_id: randomUUID(),
      total_topups: Number(ledger.total_topups) + 1,
      total_topup_usd: roundUsd(Number(ledger.total_topup_usd) + amountUsd),
      // Count this charge against the current month's pre-approved cap.
      month_topup_usd: roundUsd(effectiveMonthSpend(ledger) + amountUsd),
      allowance_period_start: rolled ? currentMonthStartISO() : ledger.allowance_period_start,
      allowance_used_usd: rolled ? 0 : Number(ledger.allowance_used_usd),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

/** Settle by charge id. No-op if the charge is already settled (idempotent). */
export async function settleTopUpSuccessById(
  serviceDb: SupabaseClient,
  chargeId: string
): Promise<void> {
  const cfg = getBillingConfig();
  const { data: charge } = await serviceDb
    .from("top_up_charges")
    .update({ status: "succeeded", settled_at: new Date().toISOString() })
    .eq("id", chargeId)
    .eq("status", "pending") // only the first settle wins
    .select()
    .maybeSingle();

  if (!charge) return; // already settled or not pending
  await applySuccessfulTopUp(serviceDb, charge.user_id, Number(charge.amount_usd), cfg.thresholdUsd);
}

/** Settle from a Stripe PaymentIntent (webhook path). */
export async function settleTopUpFromIntent(
  serviceDb: SupabaseClient,
  intent: Stripe.PaymentIntent
): Promise<void> {
  const { data: charge } = await serviceDb
    .from("top_up_charges")
    .select("id")
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle();
  if (charge) await settleTopUpSuccessById(serviceDb, charge.id);
}

export async function markTopUpFailed(
  serviceDb: SupabaseClient,
  chargeId: string,
  userId: string,
  reason: string
): Promise<void> {
  await serviceDb
    .from("top_up_charges")
    .update({ status: "failed", failure_reason: reason, settled_at: new Date().toISOString() })
    .eq("id", chargeId)
    .eq("status", "pending");
  await serviceDb
    .from("top_up_ledger")
    .update({
      status: "blocked",
      block_reason: "topup_failed",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
}

/** Fail from a Stripe PaymentIntent (webhook path). */
export async function failTopUpFromIntent(
  serviceDb: SupabaseClient,
  intent: Stripe.PaymentIntent
): Promise<void> {
  const { data: charge } = await serviceDb
    .from("top_up_charges")
    .select("id, user_id")
    .eq("stripe_payment_intent_id", intent.id)
    .maybeSingle();
  if (charge) {
    const reason = intent.last_payment_error?.code ?? "payment_failed";
    await markTopUpFailed(serviceDb, charge.id, charge.user_id, reason);
  }
}

/**
 * Pre-call gate. Returns whether the user may start a new AI request.
 * Blocks while a top-up is pending or failed so token spend can't outrun
 * the charge (bounding overshoot to at most one in-flight call).
 */
export async function getBillingGate(userId: string): Promise<BillingGate> {
  const cfg = getBillingConfig();
  const serviceDb = createServiceClient();

  if (!cfg.enabled) {
    return { allowed: true, status: "disabled", meterUsd: 0, thresholdUsd: cfg.thresholdUsd };
  }
  if (await isBillingExempt(serviceDb, userId)) {
    return { allowed: true, status: "exempt", meterUsd: 0, thresholdUsd: cfg.thresholdUsd };
  }

  const ledger = await loadLedger(serviceDb, userId);
  const meterUsd = Number(ledger.meter_usd);

  if (ledger.status === "pending") {
    return { allowed: false, reason: "topup_pending", status: "pending", meterUsd, thresholdUsd: cfg.thresholdUsd };
  }
  if (ledger.status === "blocked") {
    return {
      allowed: false,
      reason: ledger.block_reason ?? "topup_failed",
      status: "blocked",
      meterUsd,
      thresholdUsd: cfg.thresholdUsd,
    };
  }
  return { allowed: true, status: "ok", meterUsd, thresholdUsd: cfg.thresholdUsd };
}

/** Full billing snapshot for the customer UI (meter, limit, warnings). */
export async function getBillingSummary(userId: string): Promise<BillingSummary> {
  const cfg = getBillingConfig();
  const serviceDb = createServiceClient();

  const base = {
    enabled: cfg.enabled,
    thresholdUsd: cfg.thresholdUsd,
    chargeUsd: cfg.chargeUsd,
  };

  if (!cfg.enabled || (await isBillingExempt(serviceDb, userId))) {
    return {
      ...base,
      exempt: !cfg.enabled ? false : true,
      status: cfg.enabled ? "exempt" : "disabled",
      blockReason: null,
      allowed: true,
      meterUsd: 0,
      untilNextTopUpUsd: cfg.thresholdUsd,
      monthlyLimitUsd: limitFor({ monthly_topup_limit_usd: null } as LedgerRow, cfg),
      monthTopUpUsd: 0,
      monthlyRemainingUsd: limitFor({ monthly_topup_limit_usd: null } as LedgerRow, cfg),
      nextTopUpExceedsLimit: false,
      hasPaymentMethod: true,
      lifetimeTopUps: 0,
      lifetimeTopUpUsd: 0,
    };
  }

  const ledger = await loadLedger(serviceDb, userId);
  const meterUsd = Number(ledger.meter_usd);
  const monthSpend = effectiveMonthSpend(ledger);
  const limit = limitFor(ledger, cfg);
  const ctx = await resolvePaymentContext(serviceDb, userId);

  return {
    ...base,
    exempt: false,
    status: ledger.status,
    blockReason: ledger.status === "pending" ? "topup_pending" : ledger.block_reason,
    allowed: ledger.status === "ok",
    meterUsd,
    untilNextTopUpUsd: roundUsd(Math.max(0, cfg.thresholdUsd - meterUsd)),
    monthlyLimitUsd: limit,
    monthTopUpUsd: monthSpend,
    monthlyRemainingUsd: roundUsd(Math.max(0, limit - monthSpend)),
    nextTopUpExceedsLimit: monthSpend + cfg.chargeUsd > limit + 1e-9,
    hasPaymentMethod: !("error" in ctx),
    lifetimeTopUps: Number(ledger.total_topups),
    lifetimeTopUpUsd: Number(ledger.total_topup_usd),
  };
}

/**
 * Update the user's pre-approved monthly top-up cap. If raising it clears a
 * 'limit_reached' pause and a top-up is still due, re-fire it immediately.
 */
export async function setMonthlyLimit(userId: string, limitUsd: number): Promise<BillingSummary> {
  const serviceDb = createServiceClient();
  const cfg = getBillingConfig();
  const safeLimit = Number.isFinite(limitUsd) && limitUsd >= 0 ? roundUsd(limitUsd) : 0;

  await serviceDb
    .from("top_up_ledger")
    .update({ monthly_topup_limit_usd: safeLimit, updated_at: new Date().toISOString() })
    .eq("user_id", userId);

  const ledger = await loadLedger(serviceDb, userId);
  const monthSpend = effectiveMonthSpend(ledger);

  // Raising the cap above what's already owed un-pauses an automatic top-up.
  if (
    ledger.status === "blocked" &&
    ledger.block_reason === "limit_reached" &&
    monthSpend + cfg.chargeUsd <= safeLimit + 1e-9
  ) {
    await serviceDb
      .from("top_up_ledger")
      .update({
        status: "ok",
        block_reason: null,
        cycle_id: randomUUID(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", userId);

    const fresh = await loadLedger(serviceDb, userId);
    if (Number(fresh.meter_usd) >= cfg.thresholdUsd) {
      await triggerTopUp(serviceDb, fresh);
    }
  }

  return getBillingSummary(userId);
}

/**
 * Retry a failed top-up after the customer updates their card. Rotates the
 * cycle so a fresh idempotent charge can be created, then re-triggers.
 */
export async function retryTopUp(userId: string): Promise<BillingGate> {
  const serviceDb = createServiceClient();
  const ledger = await loadLedger(serviceDb, userId);
  // Only retry card failures here; a 'limit_reached' pause is cleared by
  // raising the monthly limit (setMonthlyLimit), not by re-charging.
  if (ledger.status !== "blocked" || ledger.block_reason !== "topup_failed") {
    return getBillingGate(userId);
  }

  await serviceDb
    .from("top_up_ledger")
    .update({
      status: "ok",
      block_reason: null,
      cycle_id: randomUUID(),
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  const fresh = await loadLedger(serviceDb, userId);
  const cfg = getBillingConfig();
  if (Number(fresh.meter_usd) >= cfg.thresholdUsd) {
    await triggerTopUp(serviceDb, fresh);
  }
  return getBillingGate(userId);
}
