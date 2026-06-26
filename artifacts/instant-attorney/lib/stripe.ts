import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: "2026-05-27.dahlia",
    });
  }
  return _stripe;
}

export const PHASE2_PRICE_ID = process.env.STRIPE_PHASE2_PRICE_ID ?? "";
export const CONSULT_PRICE_ID = process.env.STRIPE_CONSULT_PRICE_ID ?? "";
