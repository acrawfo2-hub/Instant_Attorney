---
name: QA tester allowlist
description: How QA testers are always treated as paid in instant-attorney
---
QA testers (lib/testers.ts TESTER_EMAILS, currently vicky.crawford12@gmail.com) are auto-granted a `bypass` phase2 subscription row on login, in requireSubscription, and in the dashboard gate.

**Why:** live testers must never hit the Stripe paywall; the app checks `subscriptions.status` in many routes, so seeding one DB row (via service client, upsert onConflict user_id) makes every gate pass without touching each route.

**How to apply:** to add a tester, append their lowercase email to TESTER_EMAILS. Don't add per-route email checks. Grant is a no-op when status is already active/trialing/bypass and never throws (login must not fail).
