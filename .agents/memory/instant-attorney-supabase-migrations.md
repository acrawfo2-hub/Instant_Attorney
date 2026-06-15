---
name: Instant-Attorney live Supabase has unapplied migrations
description: Live Supabase DB is missing later-stage tables; writes fail PGRST205 and are silently swallowed. How to detect and what the user must run.
---

The live Supabase project for Instant-Attorney does NOT have all `supabase/schema-stage*.sql`
migrations applied. Confirmed missing (as of testing): `usage_events`, `usage_period_totals`
(stage 9) and `form_instruments` (stage 10). `consults` (stage 7) is also absent but that is
EXPECTED — it is legacy, superseded by `consult_requests`, which exists.

**Symptom:** feature code that writes to a missing table fails with PostgREST error
`PGRST205 "Could not find the table 'public.<t>' in the schema cache"`. Most write paths
(e.g. `parseGovernmentForms` upsert in `lib/file-parser.ts`, usage recording) destructure
only `{ data }` and ignore `error`, so the failure is silent — the feature appears to "work"
(AI emits the detection block) but nothing is persisted, and reads return `[]`.

**Detection gotcha:** a `select("*", { count: "exact", head: true })` HEAD request returns a
FALSE "ok" for a missing table (no error surfaced). To reliably detect existence, use a real
row select: `db.from(t).select("*").limit(1)` and check `error`.

**Why I can't fix it from tooling:** no Supabase DB connection string / DB password is
available (the service-role key is a JWT, not a DB password; `DATABASE_URL` points at Replit's
own Postgres, not Supabase). supabase-js REST cannot run DDL. So missing tables must be created
by the USER running the SQL files in the Supabase SQL editor.

**Remediation to give the user:** run `supabase/schema-stage9.sql` then
`supabase/schema-stage10.sql` in the Supabase SQL editor (stage 10 says run after stage 9).
Skip stage 7's `consults` (legacy). After applying, gov-forms persistence and usage tracking work.

**Why:** these stage migrations were authored in-repo but never applied to the live project;
there is no automatic migration runner for this Supabase-direct app.
