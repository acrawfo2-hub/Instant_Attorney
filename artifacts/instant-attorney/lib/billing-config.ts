/**
 * Subscription + token top-up billing configuration.
 *
 * All economics are env-driven so they can be tuned without a deploy.
 * Defaults preserve >=35% gross margin on token usage after model cost and
 * Stripe fees (see schema-stage19 header for the margin derivation).
 */

function num(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Stripe US card fee on a single charge (2.9% + $0.30). */
export function stripeFeeUsd(chargeUsd: number): number {
  return chargeUsd * 0.029 + 0.3;
}

/**
 * Target gross-margin band the top-up meter must stay inside. The top-up amount
 * (price) is held fixed by product decision; the *threshold* (COGS consumed per
 * charge) is the lever that sets margin, so we keep it inside this band rather
 * than trusting a hand-set env value that can drift out of range when the price
 * changes. Steady-state margin on a cycle is
 *   (charge − threshold − stripeFee) / charge
 * because carry-forward makes one charge correspond to exactly `threshold` COGS.
 */
export const TARGET_MARGIN_FLOOR = 0.35;
export const TARGET_MARGIN_CEIL = 0.5;

/**
 * The COGS threshold that yields a given gross margin for a fixed charge.
 * A HIGHER threshold means more COGS per charge and therefore a LOWER margin,
 * so `thresholdForMargin(c, FLOOR) >= thresholdForMargin(c, CEIL)`.
 */
export function thresholdForMargin(chargeUsd: number, marginPct: number): number {
  return roundUsd(chargeUsd * (1 - marginPct) - stripeFeeUsd(chargeUsd));
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Clamp a configured threshold into the margin band for the given charge.
 * Returns the effective threshold plus whether it had to be adjusted (so the
 * caller can log the drift). An explicitly-set in-band threshold is respected
 * exactly; an out-of-band one is pulled to the nearest boundary — never past it.
 */
export function clampThresholdToMarginBand(
  chargeUsd: number,
  thresholdUsd: number
): { thresholdUsd: number; clamped: boolean; marginPct: number } {
  // margin CEIL → smallest allowed threshold; margin FLOOR → largest allowed.
  const lo = Math.max(0, thresholdForMargin(chargeUsd, TARGET_MARGIN_CEIL));
  const hi = Math.max(lo, thresholdForMargin(chargeUsd, TARGET_MARGIN_FLOOR));
  const effective = Math.min(hi, Math.max(lo, thresholdUsd));
  return {
    thresholdUsd: effective,
    clamped: Math.abs(effective - thresholdUsd) > 1e-9,
    marginPct: topUpMarginPct(chargeUsd, effective),
  };
}

export interface BillingConfig {
  /** Master switch. When false, usage is still metered but never charged/blocked. */
  enabled: boolean;
  /** Cumulative COGS (USD) since last top-up that triggers a charge. */
  thresholdUsd: number;
  /** One-time top-up amount (USD) charged when the threshold is crossed. */
  chargeUsd: number;
  /**
   * Monthly COGS (USD) the $9.99 subscription absorbs before the top-up meter
   * starts. Default 0 = meter from $0. Raise this once real usage data exists
   * to tune the share of users who ever hit a top-up.
   */
  includedAllowanceUsd: number;
  /** Stripe product id the top-up is attributed to (metadata only). */
  productId: string;
  /**
   * Default pre-approved ceiling (USD) on automatic top-ups per calendar month,
   * applied when a customer hasn't set their own. Top-ups auto-charge up to
   * this cap; beyond it the ledger pauses until the user raises their limit.
   */
  defaultMonthlyLimitUsd: number;
  /**
   * Completion-grace buffer (USD of model COGS) a customer who has opted in may
   * consume *past* a billing block (top-up pending / failed / limit reached) so
   * an in-flight document can always finish. The overshoot is never forgiven —
   * it stays on the meter and is collected on the next successful top-up — so
   * margin is preserved and total exposure is bounded to this buffer. Defaults
   * to one top-up charge: a single bounded cycle of "finish now, pay later".
   */
  graceBufferUsd: number;
}

export function getBillingConfig(): BillingConfig {
  const chargeUsd = num("USAGE_TOPUP_CHARGE_USD", 8.5);

  // The price is fixed by product decision; keep the trigger threshold inside
  // the target margin band (35–50%) so a price value that drifts (or a stale
  // env threshold) can never quietly push realized margin out of range. At the
  // committed $8.50 charge the default $4.75 threshold is already in band
  // (≈37.7%) and is left untouched; if the live charge is lower (e.g. $7.50),
  // $4.75 would yield ≈29.8% and is pulled up to the floor boundary instead.
  const band = clampThresholdToMarginBand(
    chargeUsd,
    num("USAGE_TOPUP_THRESHOLD_USD", 4.75)
  );
  if (band.clamped) {
    console.warn(
      `[billing-config] top-up threshold adjusted into the ${Math.round(
        TARGET_MARGIN_FLOOR * 100
      )}–${Math.round(TARGET_MARGIN_CEIL * 100)}% margin band for a $${chargeUsd.toFixed(
        2
      )} charge → $${band.thresholdUsd.toFixed(2)} (≈${Math.round(
        band.marginPct * 100
      )}% margin).`
    );
  }

  return {
    enabled: process.env.USAGE_TOPUP_ENABLED !== "false",
    thresholdUsd: band.thresholdUsd,
    chargeUsd,
    includedAllowanceUsd: num("USAGE_INCLUDED_ALLOWANCE_USD", 0),
    productId: process.env.STRIPE_TOPUP_PRODUCT_ID ?? "",
    defaultMonthlyLimitUsd: num("USAGE_DEFAULT_MONTHLY_TOPUP_LIMIT_USD", 25),
    // Default the completion-grace buffer to one top-up charge.
    graceBufferUsd: num("USAGE_GRACE_BUFFER_USD", chargeUsd),
  };
}

/**
 * Margin a single top-up cycle yields given the COGS consumed in that cycle.
 * Used for reporting / guard-rails. Stripe US card fee = 2.9% + $0.30.
 */
export function topUpMarginPct(chargeUsd: number, cogsUsd: number): number {
  const profit = chargeUsd - cogsUsd - stripeFeeUsd(chargeUsd);
  return chargeUsd > 0 ? profit / chargeUsd : 0;
}
