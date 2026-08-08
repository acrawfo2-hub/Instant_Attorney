-- Instant Attorney — Schema verification, stages 38–45
--
-- WHY THIS FILE EXISTS
-- `schema-verify.sql` historically stopped at stage 37. Every object the
-- ORCHESTRATOR depends on was added after that (stages 39, 40, 42, 43) and was
-- therefore unverifiable: if the live database were missing
-- `client_workspace_drafts`, side-panel drafts would fail silently (PGRST205)
-- mid-conversation, and a missing `orchestrator_tool_calls` would drop every
-- tool-call audit row on the floor without surfacing an error to the client.
--
-- RELATIONSHIP TO schema-verify.sql
-- PR #88 independently extended `schema-verify.sql` to cover some of the same
-- ground, so five checks now appear in both files (orchestrator_tool_calls,
-- case_files.chat_session_summary, document_review_runs, document_improvements,
-- document_qa_citations). Duplication is harmless — both are read-only — and the
-- files are NOT redundant: only this one covers the stage 38/39/40 objects
-- (including `client_workspace_drafts`, the orchestrator-critical one), the RLS
-- flags, and the indexes. Run both; consolidate later if it becomes annoying.
--
-- HOW TO RUN
-- Supabase → SQL Editor → paste and Run, AFTER schema-verify.sql.
-- Read-only: nothing here writes, locks, or alters. Safe to re-run any time.
--
-- EXPECTED RESULT
-- Every row shows status = OK. Any MISSING row names the migration to apply —
-- see the `fix` column.

select
  'case_files.created_by_attorney' as object,
  case when exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'case_files' and column_name = 'created_by_attorney'
  ) then 'OK' else 'MISSING' end as status,
  'schema-stage38-attorney-onboarded-clients.sql' as fix

union all select 'case_files.client_display_name', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'client_display_name'
) then 'OK' else 'MISSING' end, 'schema-stage38-attorney-onboarded-clients.sql'

union all select 'case_files.client_email', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'client_email'
) then 'OK' else 'MISSING' end, 'schema-stage38-attorney-onboarded-clients.sql'

-- ── Stage 39 — attorney freestyle workspace ─────────────────────────────────
union all select 'attorney_workspace_messages.attachments', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'attorney_workspace_messages' and column_name = 'attachments'
) then 'OK' else 'MISSING' end, 'schema-stage39-freestyle-workspace.sql'

union all select 'attorney_workspace_drafts', case when exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'attorney_workspace_drafts'
) then 'OK' else 'MISSING' end, 'schema-stage39-freestyle-workspace.sql'

union all select 'attorney_workspace_drafts_scope_idx', case when exists (
  select 1 from pg_indexes where indexname = 'attorney_workspace_drafts_scope_idx'
) then 'OK' else 'MISSING' end, 'schema-stage39-freestyle-workspace.sql'

union all select 'case_files.attorney_workspace_summary', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'attorney_workspace_summary'
) then 'OK' else 'MISSING' end, 'schema-stage39-freestyle-workspace.sql'

union all select 'case_files.attorney_workspace_summarized_at', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'attorney_workspace_summarized_at'
) then 'OK' else 'MISSING' end, 'schema-stage39-freestyle-workspace.sql'

-- ── Stage 40 — client freestyle drafts (ORCHESTRATOR-CRITICAL) ──────────────
-- The side-panel drafts store. Without it, every ---DRAFT:--- block the
-- orchestrator emits is silently discarded after the stream completes.
union all select 'client_workspace_drafts', case when exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'client_workspace_drafts'
) then 'OK' else 'MISSING' end, 'schema-stage40-client-workspace-drafts.sql'

union all select 'client_workspace_drafts.promoted_document_id', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'client_workspace_drafts' and column_name = 'promoted_document_id'
) then 'OK' else 'MISSING' end, 'schema-stage40-client-workspace-drafts.sql'

union all select 'client_workspace_drafts.source', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'client_workspace_drafts' and column_name = 'source'
) then 'OK' else 'MISSING' end, 'schema-stage40-client-workspace-drafts.sql'

union all select 'client_workspace_drafts_scope_idx', case when exists (
  select 1 from pg_indexes where indexname = 'client_workspace_drafts_scope_idx'
) then 'OK' else 'MISSING' end, 'schema-stage40-client-workspace-drafts.sql'

union all select 'client_workspace_drafts RLS enabled', case when exists (
  select 1 from pg_tables
  where schemaname = 'public' and tablename = 'client_workspace_drafts' and rowsecurity = true
) then 'OK' else 'MISSING' end, 'schema-stage40-client-workspace-drafts.sql'

-- ── Stage 42 — orchestrator tool-call audit (ORCHESTRATOR-CRITICAL) ─────────
union all select 'orchestrator_tool_calls', case when exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'orchestrator_tool_calls'
) then 'OK' else 'MISSING' end, 'schema-stage42-orchestrator-tool-calls.sql'

union all select 'orchestrator_tool_calls_scope_idx', case when exists (
  select 1 from pg_indexes where indexname = 'orchestrator_tool_calls_scope_idx'
) then 'OK' else 'MISSING' end, 'schema-stage42-orchestrator-tool-calls.sql'

union all select 'orchestrator_tool_calls RLS enabled', case when exists (
  select 1 from pg_tables
  where schemaname = 'public' and tablename = 'orchestrator_tool_calls' and rowsecurity = true
) then 'OK' else 'MISSING' end, 'schema-stage42-orchestrator-tool-calls.sql'

-- ── Stage 43 — consumer "organize on leave" digest ──────────────────────────
union all select 'case_files.chat_session_summary', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'chat_session_summary'
) then 'OK' else 'MISSING' end, 'schema-stage43-consumer-session-digest.sql'

union all select 'case_files.chat_session_summarized_at', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'case_files' and column_name = 'chat_session_summarized_at'
) then 'OK' else 'MISSING' end, 'schema-stage43-consumer-session-digest.sql'

-- ── Stage 44 — attorney document review runs ────────────────────────────────
union all select 'document_review_runs', case when exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'document_review_runs'
) then 'OK' else 'MISSING' end, 'schema-stage44-document-review-runs.sql'

union all select 'document_improvements', case when exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'document_improvements'
) then 'OK' else 'MISSING' end, 'schema-stage44-document-review-runs.sql'

-- ── Stage 45 — document Q&A citations ───────────────────────────────────────
union all select 'document_qa_citations', case when exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'document_qa_citations'
) then 'OK' else 'MISSING' end, 'schema-stage45-document-qa-citations.sql'

-- ── Cross-cutting: fact kind tag the What-If path degrades around ───────────
-- lib/prompts.ts classifies hypotheticals by kind OR the "What-if · " prefix,
-- so the app works without this column — but the tag is only durable with it.
union all select 'fact_items.kind', case when exists (
  select 1 from information_schema.columns
  where table_schema = 'public' and table_name = 'fact_items' and column_name = 'kind'
) then 'OK' else 'MISSING' end, 'schema-stage17-fact-kind.sql'

order by status desc, object;
