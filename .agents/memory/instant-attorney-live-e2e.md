---
name: Instant-Attorney live e2e against shared Supabase
description: How to run a real end-to-end client-save test against the live backend, including the onboarding gates, the email-confirm wall, and the attorney-email side effect to avoid.
---

# Live e2e of the client draft-save flow

**One Supabase project is shared across dev and prod.** Running a smoke against the
dev app (localhost:80 via the proxy) exercises the *same* RLS, migrations, and auth
as production — so it catches the migration-drift / RLS / auth class of bug that the
merged unit tests can't (they mock the DB and Anthropic).

## Cheap, AI-free smoke
`artifacts/instant-attorney/scripts/e2e.mjs` checks liveness (`GET /login`), auth
round-trip (`POST /api/auth/login` returns a session cookie), and the submit-critical
`documents` columns. Run with `node --env-file=.env.local scripts/e2e.mjs` and pass
`E2E_EMAIL`/`E2E_PASSWORD`. No AI cost, no side effects.

## Provisioning a usable test user
Registration requires **email confirmation**, so a fresh UI signup can't log in.
Bypass it: create a confirmed user via the Supabase admin API
`POST {SUPA_URL}/auth/v1/admin/users` with `{ email, password, email_confirm: true }`
using the service-role key (only in `.env.local`; sandbox `process.env` has no secrets,
so run scripts with `node --env-file=.env.local`).

## Onboarding gates (seed to skip the UI)
To reach draft generation the user needs these rows (seed via service-role REST):
`profiles` (id=userId, email, full_name), `subscriptions` (status in
active/trialing/bypass), `ai_consents`, `representation_agreements`, and an open
`case_files` row. Then navigate directly to `/wizard/<type>?caseFileId=<id>` — the
wizard **auto-generates on mount** (no chat handoff needed; `legal_strategy` defaults
to `{}` and is only what gates the chat→wizard button).

## What "saved" vs "submitted" means
Initial wizard generation writes `documents.draft_text` at **status `draft`**
(`submitted_at` null) = saved, not submitted. Status only flips to `pending_review`
if the user clicks **"Update & Send"** / submits the checklist — and that path fires a
**real "document ready" email to the attorney** via Resend. For a smoke, stop before
submit and verify persistence in the DB.

## Cleanup
Deleting the auth user (`DELETE /auth/v1/admin/users/<id>`) cascades
profiles → subscriptions/consents/agreements/case_files → documents, leaving no
residue. Delete `documents`/`case_files` explicitly first as belt-and-suspenders.
