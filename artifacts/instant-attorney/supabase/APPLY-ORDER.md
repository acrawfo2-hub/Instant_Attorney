# Applying migrations

**Verified against the deployed database on 2026-08-13.** Every migration in
this directory has been applied. There is no known drift.

Do not trust that sentence indefinitely — re-run the check below. This file has
been wrong before, in both directions, and a stale claim about the schema is
worse than no claim.

## How to check

```
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/check-schema.mjs --applied
```

That reports any table the migrations define which is missing from the deployed
database. It is deliberately not in CI — it needs the service-role key, and
drift is an operational fact rather than a defect in the code. **Which is
exactly why it goes unrun for months at a time.** Run it after any deploy that
includes a new migration.

`pnpm schema:strict`, which *is* in CI, checks the other three directions:
migrations colliding with each other, code querying a table no migration
defines, and code selecting a column no migration defines. It cannot see whether
a migration was actually applied.

## What the drift turned out to be

Worth recording, because the shape of it was the opposite of what this file
previously claimed.

This document used to open by saying eight tables were missing —
`document_review_runs`, `document_improvements`, `document_qa_citations`,
`document_revisions`, `workspace_draft_jobs`, `document_generation_jobs`,
`document_sections`, `document_delivery_drafts` — and warned that stage 48 was
blocked on a table-name collision. **All eight existed.** They had been applied
at some point after this file was written, and the collision had been resolved:
`document_delivery_sends` and `document_deliveries` are both present and
distinct.

Meanwhile five tables that live code writes to did **not** exist, and this file
never mentioned them:

| Table | What was broken |
|---|---|
| `chat_acp_jobs` | the durable turn queue — every client chat turn |
| `chat_acp_acknowledgments` | the per-client delivery cursor |
| `document_qa_findings` | the QA gate the approve route blocks on |
| `document_qa_check_runs` | QA check bookkeeping |
| `attorney_document_messages` | the workbench partner-chat transcript |

All five are now applied. The failure mode is the one the whole schema guard
exists for: unapplied migrations fail at runtime with PGRST205 while typecheck,
lint and every unit test stay green, because none of them touch a database.

`consults` (stage 7) is defined by a migration, absent from the database, and
queried by no code. It is a legacy definition, not drift. Leave it.

## Order, if you ever rebuild from scratch

Dependencies come from foreign keys and from `alter table` statements targeting
a table an earlier stage creates. Within a group, order does not matter.

1. `schema.sql`, then `schema-stage2.sql` … in numeric order through stage 48.
   The catch-up files (`schema-catch-up-*.sql`) restate earlier stages so a
   fresh database can be built in one pass; they are safe to re-run and safe to
   skip if the stages themselves have run.
2. `schema-stage49-subscription-consult-credits.sql` — adds
   `subscriptions.consult_credits`. Six call sites read it and stage 48's
   verifier expects it, but no migration had ever created it: it had been added
   by hand. This file makes the migrations the source of truth again.
3. `schema-stage49-drop-prewarm-status.sql` — narrows `documents_status_check`
   to the five live states, now that the retired `pre_warmed` status is gone
   from the code. Fails loudly if a row is still in that state.
4. `schema-stage50-drop-retired-attorney-rooms.sql` — **optional and
   destructive.** See below.
5. `schema-stage51-function-execute-grants.sql` — revokes EXECUTE on the
   SECURITY DEFINER helpers from PUBLIC, then grants it back to the roles that
   actually call each one. Found by Supabase's database linter, which nothing in
   this repo had ever run. Read the note inside it: `revoke ... from anon` is a
   no-op while PUBLIC still holds the grant, which is why this had gone
   unnoticed.

## Safety

Stage 51 changes permissions, not data. Every other migration through stage 49
is non-destructive: no `drop table`, no
`truncate`, no `delete from`. Every `drop` is an idempotency guard — `drop
policy if exists`, `drop constraint if exists`, `drop trigger if exists`.

**Stage 50 is the one exception, and it is deliberate.** It drops the three
tables behind the two retired attorney AI rooms
(`attorney_workspace_messages`, `attorney_workspace_drafts`,
`case_brainstorm_messages`) and two `case_files` columns. All three tables were
verified empty before it was applied. If you are rebuilding a database that has
real work product in them, read the note inside the file and count the rows
first — nothing depends on this having run.

Four migrations write data, all backfills guarded by `where not exists` or
equivalent, so re-running is safe:

- `schema-stage46-auth-access-repair.sql` — backfills missing `profiles` rows
- `schema-stage46-document-revisions.sql`
- `schema-stage47-message-boundary-sync.sql`
- `schema-stage47-section-refinement.sql`

Take a backup before any apply regardless. A backup is the only thing that makes
a bad apply reversible.

## Verifying a specific stage

Migrations that only `alter` an existing table leave no new relation behind, so
whether they have run cannot be inferred from the table list. Check for their
specific columns:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'documents'
  and column_name in ('instrument_key');   -- stage 47
```
