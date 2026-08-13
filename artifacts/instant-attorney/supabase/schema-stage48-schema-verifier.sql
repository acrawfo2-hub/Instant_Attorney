-- Instant Attorney — Stage 48: schema verifier as a callable function
-- Paste this ENTIRE file into Supabase → SQL Editor → Run.
-- Idempotent: safe to re-run.
--
-- WHY THIS EXISTS
-- Unapplied migrations are this system's worst failure mode because they fail
-- SILENTLY: PostgREST answers PGRST205 and the write looks like it succeeded.
-- supabase/schema-verify.sql and schema-verify-stage38-45.sql already encode
-- what the database should contain — but only a human pasting SQL can run them,
-- so nothing checks continuously.
--
-- This wraps the same expectations in a function the admin console calls over
-- RPC, so /admin/health can answer "is the live schema current?" on every load.
-- A head-select per table is NOT a substitute: it returns a false OK often
-- enough that .agents/memory warns about it explicitly.
--
-- Keep the arrays below in sync when you add a migration stage. The console
-- reports a missing verifier function itself, so forgetting to re-run this file
-- is visible rather than silent.

create or replace function public.admin_schema_verify()
returns table (object text, kind text, status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  item  text;
  parts text[];
begin
  -- ── Tables ───────────────────────────────────────────────────────────────
  foreach item in array array[
    'admin_audit_log',
    'ai_consents',
    'attachments',
    'attorney_subscriber_agreements',
    'attorney_workspace_drafts',
    'attorney_workspace_messages',
    'case_brainstorm_messages',
    'case_files',
    'case_messages',
    'client_workspace_drafts',
    'consult_notes',
    'consult_recordings',
    'consult_requests',
    'document_comments',
    'document_deliveries',
    'document_executions',
    'document_improvements',
    'document_qa_citations',
    'document_review_runs',
    'documents',
    'fact_items',
    'financial_items',
    'financial_secure_ref',
    'form_instruments',
    'form_verifications',
    'intake_messages',
    'matter_archives',
    'orchestrator_tool_calls',
    'profiles',
    'requested_attachments',
    'roadmap_snapshots',
    'subscriptions',
    'top_up_ledger',
    'usage_events',
    'usage_period_totals',
    'what_if_sessions'
  ] loop
    return query select item, 'table'::text, case when exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = item
    ) then 'OK' else 'MISSING' end::text;
  end loop;

  -- ── Columns (table.column) ───────────────────────────────────────────────
  foreach item in array array[
    'ai_consents.signature_name',
    'attorney_workspace_messages.attachments',
    'case_files.attorney_workspace_summarized_at',
    'case_files.attorney_workspace_summary',
    'case_files.chat_mode',
    'case_files.chat_session_summarized_at',
    'case_files.chat_session_summary',
    'case_files.client_display_name',
    'case_files.client_email',
    'case_files.counsel_intake_at',
    'case_files.file_type',
    'case_files.last_file_synced_at',
    'case_files.pre_consult_memo',
    'case_files.title',
    'client_workspace_drafts.promoted_document_id',
    'client_workspace_drafts.source',
    'consult_requests.fee_estimate_draft',
    'consult_requests.recording_consent_at',
    'consult_requests.session_started_at',
    'consult_requests.wrap_up_draft',
    'documents.attorney_second_draft_prompt',
    'documents.facts_synced_at',
    'documents.parent_document_id',
    'documents.review_status',
    'documents.submitted_at',
    'fact_items.kind',
    'form_instruments.pdf_status',
    'profiles.account_type',
    'profiles.auto_document_review',
    'profiles.home_state',
    'subscriptions.consult_credits',
    'subscriptions.billing_exempt'
  ] loop
    parts := string_to_array(item, '.');
    return query select item, 'column'::text, case when exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = parts[1] and column_name = parts[2]
    ) then 'OK' else 'MISSING' end::text;
  end loop;

  -- ── Indexes ──────────────────────────────────────────────────────────────
  foreach item in array array[
    'attorney_workspace_drafts_scope_idx',
    'client_workspace_drafts_scope_idx',
    'orchestrator_tool_calls_scope_idx',
    'subscriptions_user_id_unique'
  ] loop
    return query select item, 'index'::text, case when exists (
      select 1 from pg_indexes where schemaname = 'public' and indexname = item
    ) then 'OK' else 'MISSING' end::text;
  end loop;

  -- ── Row level security enabled ───────────────────────────────────────────
  foreach item in array array[
    'admin_audit_log',
    'client_workspace_drafts',
    'orchestrator_tool_calls',
    'profiles',
    'subscriptions'
  ] loop
    return query select item || ' (RLS)', 'rls'::text, case when exists (
      select 1 from pg_tables
      where schemaname = 'public' and tablename = item and rowsecurity = true
    ) then 'OK' else 'MISSING' end::text;
  end loop;

  -- ── Check constraints that must allow specific values ────────────────────
  return query select 'case_files.status allows archived'::text, 'constraint'::text, case when exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'case_files_status_check' and check_clause like '%archived%'
  ) then 'OK' else 'MISSING' end::text;

  return query select 'subscriptions.status allows bypass'::text, 'constraint'::text, case when exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'subscriptions_status_check' and check_clause like '%bypass%'
  ) then 'OK' else 'MISSING' end::text;

  return query select 'subscriptions.plan allows attorney_pro'::text, 'constraint'::text, case when exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'subscriptions_plan_check' and check_clause like '%attorney_pro%'
  ) then 'OK' else 'MISSING' end::text;

  -- ── Trigger ──────────────────────────────────────────────────────────────
  return query select 'on_auth_user_created trigger'::text, 'trigger'::text, case when exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created'
  ) then 'OK' else 'MISSING' end::text;

  -- ── Data invariant: every auth user has a profile ────────────────────────
  -- Not schema, but the same class of silent breakage: subscriptions.user_id
  -- references profiles(id), so an auth user without one cannot be granted a
  -- subscription and reads as a null profile everywhere in the app.
  return query select 'every auth user has a profile'::text, 'data'::text, case when not exists (
    select 1 from auth.users u
    left join public.profiles p on p.id = u.id
    where p.id is null and u.email is not null
  ) then 'OK' else 'MISSING' end::text;
end;
$$;

revoke all on function public.admin_schema_verify() from public;
grant execute on function public.admin_schema_verify() to service_role;

-- ── Report ─────────────────────────────────────────────────────────────────
select status, count(*) as checks
from public.admin_schema_verify()
group by status
order by status;
