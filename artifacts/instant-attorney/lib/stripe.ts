import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-06-24.dahlia",
    });
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
