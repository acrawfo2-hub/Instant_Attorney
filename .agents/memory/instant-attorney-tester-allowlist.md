---
name: QA tester allowlist
description: How QA testers are always treated as paid — and always able to sign in — in instant-attorney
---
QA testers (lib/testers.ts TESTER_EMAILS, currently vicky.crawford12@gmail.com) are auto-granted a `bypass` phase2 subscription row on login, in requireSubscription, and in the dashboard gate. They are also auto-confirmed: when a tester's sign-in fails with "Email not confirmed", the login route calls `confirmTesterEmail` (service role, `admin.updateUserById({ email_confirm: true })`) and retries once.

**Why:** live testers must never hit the Stripe paywall, and must never be locked out by mail delivery — Supabase's built-in SMTP is rate-limited and its links expire. The app checks `subscriptions.status` in many routes, so seeding one DB row (service client, upsert onConflict user_id) makes every gate pass without touching each route.

**How to add a tester:** append their lowercase email to TESTER_EMAILS, and add it to the two `lower(email) in (...)` lists in `supabase/schema-stage46-auth-access-repair.sql`. Don't add per-route email checks. The grant is a no-op when status is already active/trialing/bypass and never throws (login must not fail).

**Ops escape hatch:** `node scripts/ensure-tester.mjs <email> [--password '<pw>']` creates/confirms the auth user, sets a password, backfills the profiles row, and grants the bypass subscription using the service role key. Use it when a tester can't get in at all.

**DB prerequisites** (stage 46 repairs all of these): `subscriptions_status_check` must include `'bypass'` — schema.sql declares it inline under `create table if not exists`, so pre-existing tables never picked the value up; the `subscriptions_user_id_unique` index must exist for `onConflict: "user_id"`; and a `profiles` row must exist, since `subscriptions.user_id` references it.
