-- Instant Attorney — Stage 40: Client freestyle workspace drafts
-- Run this in the Supabase SQL editor (production project).
--
-- Ports the split-screen freestyle workspace to the CONSUMER side. The chat and
-- attachments already live in the privileged intake channel (intake_messages +
-- Living File); this adds the right-hand drafts panel — working documents the
-- assistant produces during a free-form session that the client can read, edit,
-- and download in place.
--
-- Unlike the attorney workspace (private work-product), a client draft is a
-- potential deliverable: `promoted_document_id` links a draft that the client
-- has sent into the existing documents -> attorney-review pipeline, so the two
-- stores stay connected without every brainstorm scribble becoming a review row.

create table if not exists client_workspace_drafts (
  id                    uuid default gen_random_uuid() primary key,
  case_file_id          uuid references case_files(id) on delete cascade not null,
  user_id               uuid references profiles(id) on delete cascade not null,
  title                 text not null default 'Untitled draft',
  content               text not null default '',
  -- 'assistant' = produced by the AI; 'client' = created/edited by the client.
  source                text not null default 'assistant' check (source in ('assistant', 'client')),
  -- Set once the client promotes this draft into the documents pipeline.
  promoted_document_id  uuid references documents(id) on delete set null,
  created_at            timestamptz default now() not null,
  updated_at            timestamptz default now() not null
);

create index if not exists client_workspace_drafts_scope_idx
  on client_workspace_drafts (case_file_id, user_id, updated_at desc);

alter table client_workspace_drafts enable row level security;

-- Owner-only, mirroring the intake channel's privilege boundary.
drop policy if exists "clients_read_own_drafts" on client_workspace_drafts;
create policy "clients_read_own_drafts"
  on client_workspace_drafts for select
  using (user_id = auth.uid());

drop policy if exists "clients_insert_own_drafts" on client_workspace_drafts;
create policy "clients_insert_own_drafts"
  on client_workspace_drafts for insert
  with check (user_id = auth.uid());

drop policy if exists "clients_update_own_drafts" on client_workspace_drafts;
create policy "clients_update_own_drafts"
  on client_workspace_drafts for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "clients_delete_own_drafts" on client_workspace_drafts;
create policy "clients_delete_own_drafts"
  on client_workspace_drafts for delete
  using (user_id = auth.uid());
