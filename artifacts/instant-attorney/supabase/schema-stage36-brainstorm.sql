-- Instant Attorney — Stage 36: Attorney brainstorm chat
-- Run AFTER schema-stage35-consult-session.sql in the Supabase SQL editor
--
-- A private, attorney-only sounding-board chat scoped to a case file — not
-- the client-facing intake chat (intake_messages), and never visible to the
-- client. The attorney can propose Living File / legal strategy updates from
-- this chat using the same structured block format the intake chat uses
-- (see lib/file-parser.ts); each proposed block is applied explicitly by the
-- attorney (see the apply route), never automatically, so applied_at tracks
-- whether a given assistant message's proposed update has been committed.
--
-- Idempotent — safe to re-run.

create table if not exists case_brainstorm_messages (
  id            uuid default gen_random_uuid() primary key,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  author_id     uuid references profiles(id) on delete set null,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  applied_at    timestamptz,
  created_at    timestamptz default now() not null
);

create index if not exists case_brainstorm_messages_case_file_idx
  on case_brainstorm_messages (case_file_id, created_at);

alter table case_brainstorm_messages enable row level security;

drop policy if exists "attorneys_manage_brainstorm_messages" on case_brainstorm_messages;
create policy "attorneys_manage_brainstorm_messages"
  on case_brainstorm_messages for all using (public.is_attorney());
