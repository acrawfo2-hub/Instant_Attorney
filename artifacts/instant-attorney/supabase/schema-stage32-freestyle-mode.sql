-- Instant Attorney — Stage 32: Freestyle mode
-- Run this in the Supabase SQL editor (production project).
--
-- Two additions, both behind the existing ACP wall (signed agreement + active
-- subscription — unchanged):
--
--   1. case_files.chat_mode — remembers whether a client's privileged chat is in
--      'intake' (guided, one-question-at-a-time) or 'freestyle' (talk-to-Claude)
--      mode, so reopening a file resumes the mode the client left in. Freestyle
--      still writes to the same intake_messages transcript and can still accrete
--      the Living File; only the pacing/output discipline of the prompt changes.
--
--   2. attorney_workspace_messages — the attorney's OWN freestyle scratch/research
--      space, scoped to a client's case file for context but kept OUT of the
--      client's privileged intake_messages record. This is attorney work-product:
--      only attorneys can read/write it, and only their own rows. Clients never
--      see it.

-- ── 1. Client chat mode ─────────────────────────────────────────────────────
alter table case_files
  add column if not exists chat_mode text not null default 'intake'
  check (chat_mode in ('intake', 'freestyle'));

-- ── 2. Attorney freestyle work-product ──────────────────────────────────────
create table if not exists attorney_workspace_messages (
  id            uuid default gen_random_uuid() primary key,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  attorney_id   uuid references profiles(id) on delete cascade not null,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  created_at    timestamptz default now() not null
);

create index if not exists attorney_workspace_messages_scope_idx
  on attorney_workspace_messages (case_file_id, attorney_id, created_at);

alter table attorney_workspace_messages enable row level security;

-- Only attorneys, and only their own work-product rows. Reuses the stage-11
-- public.is_attorney() SECURITY DEFINER helper to avoid RLS recursion.
drop policy if exists "attorneys_read_own_workspace" on attorney_workspace_messages;
create policy "attorneys_read_own_workspace"
  on attorney_workspace_messages for select
  using (public.is_attorney() and attorney_id = auth.uid());

drop policy if exists "attorneys_insert_own_workspace" on attorney_workspace_messages;
create policy "attorneys_insert_own_workspace"
  on attorney_workspace_messages for insert
  with check (public.is_attorney() and attorney_id = auth.uid());

drop policy if exists "attorneys_delete_own_workspace" on attorney_workspace_messages;
create policy "attorneys_delete_own_workspace"
  on attorney_workspace_messages for delete
  using (public.is_attorney() and attorney_id = auth.uid());
