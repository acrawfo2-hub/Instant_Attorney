-- Instant Attorney — Stage 42: Orchestrator tool calls (audit)
-- Run this in the Supabase SQL editor (production project).
--
-- The freestyle orchestrator can CALL deterministic tools (the calculator libs)
-- mid-conversation. Each call is recorded here for auditability and cost/behavior
-- analysis. Not shown to the client except as the inline "running…" chips in the
-- chat; the audit row is the durable record of what the assistant computed.

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

-- Owner-only reads; writes happen server-side via the service client during the
-- chat loop, so no client insert policy is needed.
drop policy if exists "clients_read_own_tool_calls" on orchestrator_tool_calls;
create policy "clients_read_own_tool_calls"
  on orchestrator_tool_calls for select
  using (user_id = auth.uid());
