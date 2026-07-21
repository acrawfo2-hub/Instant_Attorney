/**
 * Zero-data-retention (ZDR) claim gate.
 *
 * Marketing / consent copy must not claim ZDR until ops has confirmed it is
 * actually enabled with Anthropic. Set ANTHROPIC_ZDR_CONFIRMED=true in the
 * environment only after that confirmation.
 */

export function isZdrConfirmed(): boolean {
  return process.env.ANTHROPIC_ZDR_CONFIRMED === "true";
}

/** Client-safe: only true when Next has inlined the public flag. */
export function isZdrConfirmedPublic(): boolean {
  return process.env.NEXT_PUBLIC_ANTHROPIC_ZDR_CONFIRMED === "true";
}

export const ZDR_PENDING_NOTICE =
  "Zero-data-retention (ZDR) with our AI provider is a pre-launch requirement and is not yet confirmed as enabled. Do not treat platform copy as a ZDR guarantee until counsel confirms Anthropic ZDR is live.";
