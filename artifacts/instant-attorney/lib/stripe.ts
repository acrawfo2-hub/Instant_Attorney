import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      // Pinned API version. The installed SDK's types advanced to a newer literal
      // ("2026-06-24.dahlia"); this cast preserves the currently-pinned billing
      // behavior without silently bumping the live API version. Bump the string
      // deliberately when you're ready to move Stripe API versions.
      apiVersion: "2026-05-27.dahlia" as unknown as "2026-06-24.dahlia",
    });
  }
  return _stripe;
}

export const PHASE2_PRICE_ID = process.env.STRIPE_PHASE2_PRICE_ID ?? "";
export const CONSULT_PRICE_ID = process.env.STRIPE_CONSULT_PRICE_ID ?? "";
