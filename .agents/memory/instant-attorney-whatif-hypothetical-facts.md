---
name: What-If answers are hypothetical contingency facts, not asserted facts
description: How the What-If Game stores/classifies hypothetical "what-if" intentions so the drafter treats them as contingencies, not established facts.
---

# What-If Game answers are contingency intentions, not asserted facts

What-If Game answers describe what the client would want **if** a hypothetical
scenario happened (e.g. "if my brother can't serve, I'd want my sister as backup
guardian"). They must NOT be drafted as facts that have occurred.

**Storage:** they are `fact_items` with `kind='hypothetical'` (`fact_items.kind`
defaults to `'fact'`; migration `schema-stage17-fact-kind.sql`). They keep
`status='confirmed'` (the client confirmed the intention) — so `status` alone can
no longer tell facts from hypotheticals.

**Classification is dual on purpose:** a fact is hypothetical if
`kind === 'hypothetical'` **OR** its description starts with `"What-if · "` (the
label prefix `answersToFacts` adds). Both `buildFileContext` (lib/prompts.ts) and
`ClientFileView` use this same predicate.
**Why dual:** the live Supabase DB may not have run the `kind` migration yet, and
legacy What-If rows predate the column. The prefix fallback keeps the distinction
working pre-migration and forever; the column just makes the tag explicit/durable.
The apply route also retries its write WITHOUT `kind` if the column is missing, so
answers are never lost before the migration runs.

**Drafter framing:** `buildFileContext` excludes hypotheticals from `CONFIRMED
FACTS` and emits a separate `CLIENT INTENTIONS & CONTINGENCY PREFERENCES` section
telling the model these are not asserted facts — use them for backup/contingency
clauses, not to assert.

**How to apply:** any new consumer of `fact_items` that distinguishes confirmed
facts from hypotheticals MUST use the dual predicate, not just `status`. Run the
stage17 SQL on the live DB to make the tag durable.

**Save-count accuracy:** the apply route must only increment its `saved` count on a
confirmed DB write and return non-2xx if writes fail — it previously incremented
`saved` unconditionally and could report success on silent data loss.
