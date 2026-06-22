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
}

export function getBillingConfig(): BillingConfig {
  return {
    enabled: process.env.USAGE_TOPUP_ENABLED !== "false",
    thresholdUsd: num("USAGE_TOPUP_THRESHOLD_USD", 4.75),
    chargeUsd: num("USAGE_TOPUP_CHARGE_USD", 8.5),
    includedAllowanceUsd: num("USAGE_INCLUDED_ALLOWANCE_USD", 0),
    productId: process.env.STRIPE_TOPUP_PRODUCT_ID ?? "",
  };
}

/**
 * Margin a single top-up cycle yields given the COGS consumed in that cycle.
 * Used for reporting / guard-rails. Stripe US card fee = 2.9% + $0.30.
 */
export function topUpMarginPct(chargeUsd: number, cogsUsd: number): number {
  const stripeFee = chargeUsd * 0.029 + 0.3;
  const profit = chargeUsd - cogsUsd - stripeFee;
  return chargeUsd > 0 ? profit / chargeUsd : 0;
}
