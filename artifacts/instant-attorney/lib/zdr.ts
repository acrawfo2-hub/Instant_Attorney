/**
 * Zero-data-retention (ZDR) claim gate.
 *
 * Marketing / consent copy must not claim ZDR until ops has confirmed it is
 * actually enabled with the AI provider(s) that may receive client content.
 *
 * Launch rule for the Grok preference: do not enable XAI_PROVIDER_ENABLED (or
 * offer Grok in production) until XAI_ZDR_CONFIRMED is true. Anthropic ZDR
 * remains gated by ANTHROPIC_ZDR_CONFIRMED as before.
 */

import type { AiProvider } from "@/lib/ai/providers";

export function isAnthropicZdrConfirmed(): boolean {
  return process.env.ANTHROPIC_ZDR_CONFIRMED === "true";
}

export function isXaiZdrConfirmed(): boolean {
  return process.env.XAI_ZDR_CONFIRMED === "true";
}

export function isProviderZdrConfirmed(provider: AiProvider): boolean {
  return provider === "xai" ? isXaiZdrConfirmed() : isAnthropicZdrConfirmed();
}

/**
 * Backward-compatible gate used by existing Anthropic-era copy.
 * True when Anthropic ZDR is confirmed. Dual-provider marketing should use
 * isAllAiProvidersZdrConfirmed() once Grok may receive client content.
 */
export function isZdrConfirmed(): boolean {
  return isAnthropicZdrConfirmed();
}

/** True when every provider the product may send client content to has ZDR. */
export function isAllAiProvidersZdrConfirmed(): boolean {
  return isAnthropicZdrConfirmed() && isXaiZdrConfirmed();
}

/** Client-safe Anthropic flag (existing). */
export function isZdrConfirmedPublic(): boolean {
  return process.env.NEXT_PUBLIC_ANTHROPIC_ZDR_CONFIRMED === "true";
}

export function isXaiZdrConfirmedPublic(): boolean {
  return process.env.NEXT_PUBLIC_XAI_ZDR_CONFIRMED === "true";
}

/**
 * Whether the product may offer Grok as a selectable provider.
 * Requires an API key. In production, also requires XAI_ZDR_CONFIRMED unless
 * XAI_PROVIDER_ENABLED=true is set explicitly for staged rollout.
 */
export function isXaiProviderOffered(): boolean {
  if (!process.env.XAI_API_KEY) return false;
  if (process.env.XAI_PROVIDER_ENABLED === "true") return true;
  if (process.env.NODE_ENV !== "production") return true;
  return isXaiZdrConfirmed();
}

export const ZDR_PENDING_NOTICE =
  "Zero-data-retention (ZDR) with our AI provider(s) is a pre-launch requirement and is not yet confirmed as enabled. Do not treat platform copy as a ZDR guarantee until counsel confirms ZDR is live for each provider that may process client content (Anthropic today; Anthropic and xAI when Grok is offered).";
