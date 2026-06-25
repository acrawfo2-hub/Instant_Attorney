---
name: Consult credits for Phase 2 add-on
description: How paid $49.99 consult add-ons are tracked for Phase 2 subscribers without overwriting their subscription plan.
---

## Rule
Phase 2 users who buy a consult ($49.99, one-time) must NOT have their `subscriptions.plan` overwritten from `"phase2"` to `"consult"`. Instead, increment `subscriptions.consult_credits`.

## DB migration required
```sql
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS consult_credits integer NOT NULL DEFAULT 0;
```
This column does NOT exist in live DB until the user runs the above SQL in the Supabase dashboard.

## How to apply
- **webhook** (`checkout.session.completed`): if `plan === "consult"` AND `existing.plan === "phase2"`, do `UPDATE SET consult_credits = consult_credits + 1` — do NOT upsert.
- **confirm** route: same check — if `existing.plan === "phase2"`, increment credit, don't upsert.
- **hasConsultSub** (dashboard): `isActiveStatus && (plan === "consult" || consult_credits > 0)`.
- **consult POST gate** (`/api/consult`): accept `plan === "consult"` OR `consult_credits > 0`; after `consult_requests` insert, decrement credits if user is credit-based (plan !== "consult").
- **checkout route**: passes `customer: stripe_customer_id` when available so saved card is pre-filled on Stripe Checkout page (one confirm-click).
- **cancel_url**: Phase 2 users buying a consult add-on cancel back to `/dashboard`, not `/onboarding`.

**Why:** subscriptions table has one row per user (`UNIQUE user_id`). Upserting plan=consult for a phase2 user destroys their recurring subscription access.
