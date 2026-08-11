-- Instant Attorney — Catch-up migration (current head)
-- Paste this ENTIRE file into Supabase → SQL Editor → Run AFTER
-- schema-catch-up-to-stage37.sql and schema-catch-up-post-stage37.sql.
-- Idempotent: safe to re-run. Every policy is dropped before it is created.
--
-- Covers the stages that no existing catch-up file contains:
--
--   * Stage 9  — usage_events / usage_period_totals. These were never folded
--                into schema-catch-up-to-stage37.sql (which covers 8 and
--                13–37), so a project restored from the "fast path" is
--                missing the entire usage ledger and every billing meter read
--                fails with PGRST205.
--   * Stage 42 — orchestrator_tool_calls
--   * Stage 43 — case_files.chat_session_summary / _summarized_at
--   * Stage 44 — document_review_runs / document_improvements
--   * Stage 45 — document_qa_citations
--   * Stage 46 — auth access repair (see schema-stage46-auth-access-repair.sql)

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 9 — usage tracking (AI tokens + storage/infra cost)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists usage_events (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  actor_id        uuid references profiles(id) on delete set null,
  case_file_id    uuid references case_files(id) on delete set null,
  category        text not null check (category in ('ai', 'storage', 'infra')),
  feature         text not null,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  bytes           bigint,
  cost_usd        numeric(12, 6) not null,
  billable        boolean not null default true,
  metadata        jsonb not null default '{}',
  created_at      timestamptz default now() not null
);

create index if not exists usage_events_user_id_created_at_idx
  on usage_events (user_id, created_at desc);
create index if not exists usage_events_case_file_id_idx
  on usage_events (case_file_id)
  where case_file_id is not null;
create index if not exists usage_events_feature_idx
  on usage_events (feature);

create table if not exists usage_period_totals (
  user_id           uuid references profiles(id) on delete cascade not null,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  ai_cost_usd       numeric(12, 6) not null default 0,
  storage_cost_usd  numeric(12, 6) not null default 0,
  infra_cost_usd    numeric(12, 6) not null default 0,
  total_cost_usd    numeric(12, 6) not null default 0,
  event_count       integer not null default 0,
  updated_at        timestamptz default now() not null,
  primary key (user_id, period_start)
);

create index if not exists usage_period_totals_user_period_end_idx
  on usage_period_totals (user_id, period_end desc);

alter table usage_events enable row level security;
alter table usage_period_totals enable row level security;

-- The attorney-read policies deliberately use public.is_attorney() rather than
-- the inline `exists (select 1 from profiles ...)` that schema-stage9.sql
-- shipped with. Stage 11 replaced them for a reason — the inline form on a
-- profiles-referencing policy is what caused the 42P17 recursion. Re-running
-- the original stage 9 file after stage 11 would reintroduce it; this file
-- lands in the post-stage-11 state directly.
drop policy if exists "users_read_own_usage_events" on usage_events;
create policy "users_read_own_usage_events"
  on usage_events for select using (auth.uid() = user_id);

drop policy if exists "attorneys_read_all_usage_events" on usage_events;
create policy "attorneys_read_all_usage_events"
  on usage_events for select using (public.is_attorney());

drop policy if exists "users_read_own_usage_period_totals" on usage_period_totals;
create policy "users_read_own_usage_period_totals"
  on usage_period_totals for select using (auth.uid() = user_id);

drop policy if exists "attorneys_read_all_usage_period_totals" on usage_period_totals;
create policy "attorneys_read_all_usage_period_totals"
  on usage_period_totals for select using (public.is_attorney());

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 42 — orchestrator tool calls (audit)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists orchestrator_tool_calls (
  id            uuid default gen_random_uuid() primary key,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  user_id       uuid references profiles(id) on delete cascade not null,
  tool_name     text not null,
  input         jsonb not null default '{}'::jsonb,
  result        jsonb,
  created_at    timestamptz default now() not null
);

create index if not exists orchestrator_tool_calls_scope_idx
  on orchestrator_tool_calls (case_file_id, user_id, created_at desc);

alter table orchestrator_tool_calls enable row level security;

drop policy if exists "clients_read_own_tool_calls" on orchestrator_tool_calls;
create policy "clients_read_own_tool_calls"
  on orchestrator_tool_calls for select
  using (user_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 43 — consumer freestyle "organize on leave" digest
-- ═══════════════════════════════════════════════════════════════════════════
alter table case_files
  add column if not exists chat_session_summary text;
alter table case_files
  add column if not exists chat_session_summarized_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 44 — attorney review runs + structured improvements
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists document_review_runs (
  id            uuid default gen_random_uuid() primary key,
  document_id   uuid references documents(id) on delete cascade not null,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  status        text not null default 'queued'
                  check (status in ('queued','running','awaiting_attorney','complete','failed')),
  stage         text,
  error         text,
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  completed_at  timestamptz
);

create index if not exists document_review_runs_doc_idx
  on document_review_runs (document_id, created_at desc);

create table if not exists document_improvements (
  id              uuid default gen_random_uuid() primary key,
  run_id          uuid references document_review_runs(id) on delete cascade not null,
  document_id     uuid references documents(id) on delete cascade not null,
  seq             integer not null default 0,
  section         text,
  kind            text not null default 'clarity'
                    check (kind in ('blocking','goal_gap','clarity','risk','compliance','citation')),
  severity        text not null default 'medium'
                    check (severity in ('high','medium','low')),
  title           text not null,
  rationale       text not null default '',
  proposed_change text not null default '',
  status          text not null default 'proposed'
                    check (status in ('proposed','accepted','rejected','superseded')),
  created_at      timestamptz default now() not null
);

create index if not exists document_improvements_run_idx
  on document_improvements (run_id, seq);
create index if not exists document_improvements_doc_idx
  on document_improvements (document_id, created_at desc);

alter table document_review_runs enable row level security;
alter table document_improvements enable row level security;

drop policy if exists "attorneys_read_review_runs" on document_review_runs;
create policy "attorneys_read_review_runs"
  on document_review_runs for select
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_attorney = true
  ));

drop policy if exists "attorneys_read_improvements" on document_improvements;
create policy "attorneys_read_improvements"
  on document_improvements for select
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_attorney = true
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 45 — authorities QA gate (citation verification)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists document_qa_citations (
  id             uuid default gen_random_uuid() primary key,
  run_id         uuid references document_review_runs(id) on delete cascade not null,
  document_id    uuid references documents(id) on delete cascade not null,
  raw            text not null,
  citation_type  text not null default 'other'
                   check (citation_type in ('case','statute','rule','other')),
  claim          text not null default '',
  verdict        text not null default 'unverified'
                   check (verdict in ('verified','unverified','unsupported','error')),
  evidence       text not null default '',
  source_url     text,
  waived         boolean not null default false,
  waived_at      timestamptz,
  created_at     timestamptz default now() not null
);

create index if not exists document_qa_citations_run_idx
  on document_qa_citations (run_id, created_at);
create index if not exists document_qa_citations_doc_idx
  on document_qa_citations (document_id, created_at desc);

alter table document_qa_citations enable row level security;

drop policy if exists "attorneys_read_qa_citations" on document_qa_citations;
create policy "attorneys_read_qa_citations"
  on document_qa_citations for select
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_attorney = true
  ));

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 46 — auth access repair
-- (identical to schema-stage46-auth-access-repair.sql; inlined so this file
-- is a single self-sufficient paste)
-- ═══════════════════════════════════════════════════════════════════════════
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('active', 'canceled', 'past_due', 'trialing', 'bypass'));

alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('phase2', 'consult', 'attorney_pro'));

create unique index if not exists subscriptions_user_id_unique
  on subscriptions (user_id);

insert into public.profiles (id, email, full_name, account_type, attorney_user_status)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  case when coalesce(u.raw_user_meta_data->>'account_type', 'client') = 'attorney_user'
       then 'attorney_user' else 'client' end,
  case when coalesce(u.raw_user_meta_data->>'account_type', 'client') = 'attorney_user'
       then 'pending' else null end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- QA testers — keep in sync with TESTER_EMAILS in lib/testers.ts.
-- Only email_confirmed_at is written: auth.users.confirmed_at is a generated
-- column on current Supabase and rejects any direct update.
update auth.users
set email_confirmed_at = now()
where lower(email) in ('vicky.crawford12@gmail.com')
  and email_confirmed_at is null;

insert into public.subscriptions (user_id, status, plan, current_period_end)
select p.id, 'bypass', 'phase2', null
from public.profiles p
where lower(p.email) in ('vicky.crawford12@gmail.com')
on conflict (user_id) do update
  set status = 'bypass',
      plan   = case when subscriptions.plan = 'consult' then 'consult' else 'phase2' end,
      updated_at = now()
  where subscriptions.status not in ('active', 'trialing', 'bypass');

-- ═══════════════════════════════════════════════════════════════════════════
-- Report
-- ═══════════════════════════════════════════════════════════════════════════
select
  u.email,
  (u.email_confirmed_at is not null) as email_confirmed,
  (p.id is not null)                 as has_profile,
  s.status                           as subscription_status,
  s.plan                             as subscription_plan
from auth.users u
left join public.profiles p on p.id = u.id
left join public.subscriptions s on s.user_id = u.id
where lower(u.email) in ('vicky.crawford12@gmail.com');

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 47 — stable document instrument identity
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.documents
  add column if not exists instrument_key text;

update public.documents
set instrument_key = nullif(btrim(content_json->>'plan_key'), '')
where instrument_key is null
  and jsonb_typeof(content_json->'plan_key') = 'string';

alter table public.documents
  drop constraint if exists documents_instrument_key_not_blank;
alter table public.documents
  add constraint documents_instrument_key_not_blank
  check (instrument_key is null or btrim(instrument_key) <> '');

create index if not exists documents_instrument_key_lookup_idx
  on public.documents (case_file_id, user_id, instrument_key, updated_at desc)
  where instrument_key is not null and parent_document_id is null;

comment on column public.documents.instrument_key is
  'Stable instrument/preset identity. Titles and content_json may change without changing this key.';
