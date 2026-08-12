# Applying stages 44–48

As of 2026-08-12 the deployed database is missing **eight tables that merged
code already writes to**. The migrations exist in this directory and were
merged; they were simply never run. Every affected feature fails at runtime
while typecheck, lint, and the unit tests stay green.

Missing, and the migration that creates each:

| Table | Migration | Feature that breaks without it |
|---|---|---|
| `document_review_runs` | `schema-stage44-document-review-runs.sql` | attorney review orchestrator |
| `document_improvements` | `schema-stage44-document-review-runs.sql` | improvement proposals |
| `document_qa_citations` | `schema-stage45-document-qa-citations.sql` | authorities QA gate |
| `document_revisions` | `schema-stage46-document-revisions.sql` | revision history |
| `workspace_draft_jobs` | `schema-stage46-durable-draft-jobs.sql` | durable draft status |
| `document_generation_jobs` | `schema-stage47-document-generation-jobs.sql` | document job worker |
| `document_sections` | `schema-stage47-section-refinement.sql` | section-aware generation |
| `document_delivery_drafts` | `schema-stage48-review-delivery.sql` | attorney delivery composer |

`schema-stage47-handle-new-user-search-path.sql` is **already applied**.

## Order

Dependencies come from foreign keys and from `alter table` statements that
target a table an earlier stage creates. Within a group, order does not matter.

1. `schema-stage44-document-review-runs.sql` — everything below depends on it
2. `schema-stage45-document-qa-citations.sql` — FK to `document_review_runs`
3. Stage 46, any order:
   - `schema-stage46-attorney-improvement-actions.sql` — alters `document_improvements` (stage 44)
   - `schema-stage46-document-revisions.sql` — alters a `document_review_runs` constraint (stage 44)
   - `schema-stage46-durable-draft-jobs.sql`
   - `schema-stage46-draft-revisions.sql`
   - `schema-stage46-auth-access-repair.sql` — see note below
4. Stage 47, any order:
   - `schema-stage47-document-generation-jobs.sql`
   - `schema-stage47-instrument-key.sql`
   - `schema-stage47-message-boundary-sync.sql`
   - `schema-stage47-section-refinement.sql`
5. `schema-stage48-review-delivery.sql` — **blocked, see below**
6. `schema-stage49-subscription-consult-credits.sql` — adds
   `subscriptions.consult_credits`. Safe in any order and almost certainly
   already a no-op: six call sites read this column and stage 48's verifier
   expects it, but no migration ever created it, so it was added by hand. The
   file exists to make the migrations the source of truth again — see the note
   inside it.

## Before you start

**Stage 48 must not be applied until the `document_delivery_sends` rename has
landed.** The version of `schema-stage48-review-delivery.sql` that shipped in
#130 creates a table called `document_deliveries`, a name stage 27 already owns
for a different thing — an immutable download audit that is live and holds
rows. Because the statement is `create table if not exists`, applying it would
do nothing at all, and every attorney send would then fail on columns that were
never created. Confirm this file declares `document_delivery_sends` before
running it.

**Stage 46's auth repair re-asserts the signup trigger** but does not recreate
`public.handle_new_user`, so the `search_path` pinned on that function by stage
47 survives. Applying stage 46 after stage 47 is safe; it is only the trigger
binding that is dropped and recreated.

## Safety

Audited across stages 44–48: no `drop table`, no `truncate`, no `delete from`.
Every `drop` is an idempotency guard — `drop policy if exists`, `drop
constraint if exists`, `drop trigger if exists`.

Four migrations write data, all of them backfills guarded by `where not
exists` or equivalent, so re-running is safe:

- `schema-stage46-auth-access-repair.sql` — backfills missing `profiles` rows
- `schema-stage46-document-revisions.sql`
- `schema-stage47-message-boundary-sync.sql`
- `schema-stage47-section-refinement.sql`

Take a backup first regardless: this database holds real client matters
(`case_files`, `fact_items`, `intake_messages` all have rows), and a backup is
the only thing that makes a bad apply reversible.

## Afterwards

```
NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
  node scripts/check-schema.mjs --applied
```

That reports any table the migrations define which is still missing from the
deployed database, and is the check that would have caught this drift. It is
deliberately not part of CI — it needs the service-role key, and drift is an
operational fact rather than a defect in the code.

## Verifying applied state

The table list above was derived from a live query. The migrations that only
`alter` an existing table leave no new relation behind, so whether they have
run cannot be inferred from the table list alone — check for their specific
columns before assuming. For example:

```sql
select column_name from information_schema.columns
where table_schema = 'public' and table_name = 'documents'
  and column_name in ('instrument_key');   -- stage 47
```
