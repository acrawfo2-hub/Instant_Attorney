import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    // apiVersion is deliberately omitted. Stripe's types pin it to a single
    // literal per SDK release, so hardcoding one breaks `next build` the
    // moment the dependency moves (^22.2.0 resolved to 22.3.2 in
    // package-lock.json but 22.4.0 on a fresh install — different literals).
    // Omitted, stripe-node falls back to DEFAULT_API_VERSION, which is the
    // exact version the installed SDK ships with — same wire behavior, no
    // version coupling.
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return _stripe;
}

export const PHASE2_PRICE_ID = process.env.STRIPE_PHASE2_PRICE_ID ?? "";
export const CONSULT_PRICE_ID = process.env.STRIPE_CONSULT_PRICE_ID ?? "";
export const ATTORNEY_PRO_PRICE_ID = process.env.STRIPE_ATTORNEY_PRO_PRICE_ID ?? "";

/** Plan → Stripe price id, so adding a tier means one new map entry, not a new ternary per route. */
export const PLAN_PRICE_IDS: Record<string, string> = {
  phase2: PHASE2_PRICE_ID,
  consult: CONSULT_PRICE_ID,
  attorney_pro: ATTORNEY_PRO_PRICE_ID,
};
