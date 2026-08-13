-- Durable ACP turn queue and per-client delivery cursor.
create table if not exists chat_acp_jobs (
  id uuid primary key default gen_random_uuid(),
  case_file_id uuid not null references case_files(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  sequence bigint not null,
  predecessor_id uuid references chat_acp_jobs(id) on delete set null,
  state text not null check (state in ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  final_text text,
  truncated boolean not null default false,
  assistant_message_id uuid references intake_messages(id) on delete set null,
  unique (case_file_id, sequence)
);
create index if not exists chat_acp_jobs_discovery_idx
  on chat_acp_jobs (case_file_id, user_id, sequence);
alter table chat_acp_jobs enable row level security;
create policy "users_read_own_chat_jobs" on chat_acp_jobs for select using (auth.uid() = user_id);
create policy "users_insert_own_chat_jobs" on chat_acp_jobs for insert with check (auth.uid() = user_id);
create policy "users_update_own_chat_jobs" on chat_acp_jobs for update using (auth.uid() = user_id);

-- Allocate a case sequence under an advisory transaction lock so simultaneous
-- browser sends cannot choose the same tail.
-- search_path pinned: a function with a mutable search_path resolves unqualified
-- names against whatever the caller's path happens to be, which is the classic
-- privilege-escalation surface. Stage 47 exists to fix exactly this on
-- handle_new_user; this one was written without it and the Supabase linter
-- caught it. SECURITY INVOKER, so it runs with the caller's rights either way.
create or replace function create_chat_acp_job(p_id uuid, p_case_file_id uuid, p_user_id uuid)
returns chat_acp_jobs language plpgsql security invoker set search_path = public, pg_temp as $$
declare created chat_acp_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_case_file_id::text, 0));
  insert into chat_acp_jobs (id, case_file_id, user_id, sequence, predecessor_id, state)
  select p_id, p_case_file_id, p_user_id, coalesce(max(sequence), 0) + 1,
    (array_agg(id order by sequence desc) filter (where state in ('queued', 'running')))[1],
    case when count(*) filter (where state in ('queued', 'running')) > 0 then 'queued' else 'running' end
  from chat_acp_jobs where case_file_id = p_case_file_id and user_id = p_user_id
  returning * into created;
  return created;
end $$;

create table if not exists chat_acp_acknowledgments (
  case_file_id uuid not null references case_files(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  acknowledged_sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (case_file_id, user_id)
);
alter table chat_acp_acknowledgments enable row level security;
create policy "users_manage_own_chat_ack" on chat_acp_acknowledgments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
