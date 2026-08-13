-- subscriptions.consult_credits — writing down a column the code already reads.
--
-- Six call sites select this column (the dashboard, the account page, consult
-- scheduling, the consult request route, and both Stripe confirm/webhook
-- handlers), and stage 48's schema verifier lists it among the columns it
-- expects to find. No migration in this repository ever created it.
--
-- It is almost certainly present in the deployed database — added by hand and
-- never written down — because without it `/dashboard` would be unusable for
-- every client: the subscription select would fail, `subRow` would be null, and
-- the "no active subscription" branch would bounce the user to /onboarding on
-- every visit. That is loud enough that someone would have noticed.
--
-- `if not exists` therefore makes this a no-op where the column is already
-- present, and repairs any environment where it is not. Either way the
-- migrations become the source of truth again, which is the point: the column
-- guard in scripts/check-schema.mjs fails on code selecting a column no
-- migration defines, and this is the gap it found.
--
-- integer, defaulting to 0: every reader treats it as a count, e.g.
-- `(subRow?.consult_credits ?? 0) > 0` in app/dashboard/page.tsx.

alter table subscriptions
  add column if not exists consult_credits integer not null default 0;
