---
name: Instant-Attorney Supabase schema & publish checklist
description: Schema/migration state of the live Supabase DB and what to set before publishing
---

# Supabase schema state & publish checklist

The schema lives as staged SQL files in `artifacts/instant-attorney/supabase/`
(`schema.sql`, `schema-stage2..12`). There is no automated migration runner — they are
applied by hand in the Supabase SQL editor.

## Schema state (verified 2026-06-17)
The live DB is fully migrated. All tables exist: profiles, case_files, fact_items,
attachments, requested_attachments, documents, intake_messages, consult_requests,
usage_events, usage_period_totals (stage9), form_instruments (stage10). The
`is_attorney()` SECURITY DEFINER function (stage11) + attorney RLS (stage11/12) are applied,
and the private storage bucket `case-attachments` exists.
(Earlier this file warned stage9/stage10 were missing — that is no longer true.)
**Verify, don't assume:** a fast head-select per table via the service client returns
PGRST205 when a table is missing, so writes can fail silently — probe before claiming a gap.

## Publish gotcha — Auth URL configuration (the real blocker)
Auth = email/password with email confirmation. `app/register/page.tsx` signs up with
`emailRedirectTo: ${location.origin}/api/auth/callback?next=/onboarding`, and
`app/api/auth/callback/route.ts` does `exchangeCodeForSession`. Supabase rejects redirect
targets not on its allow-list, so before publishing set, in Supabase → Authentication →
URL Configuration:
- Site URL = production domain (e.g. https://<app>.replit.app)
- Redirect URLs += https://<app>.replit.app/** (keep dev URL too)
Otherwise confirmation links break in production.

## Other publish must-dos (deployment env, not Supabase)
- `BYPASS_AUTH` must NOT be "true" in prod (it disables auth and impersonates BYPASS_USER_ID).
- Prod needs: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, Claude_Instant_Attorney, RESEND_API_KEY, SESSION_SECRET.
- Supabase default email sender is rate-limited; configure custom SMTP for real volume.
