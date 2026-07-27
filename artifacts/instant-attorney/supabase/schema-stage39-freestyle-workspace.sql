-- Instant Attorney — Stage 39: Freestyle workspace (attachments + drafts)
-- Run this in the Supabase SQL editor (production project).
--
-- Turns the attorney's freestyle chat into a real work-product workspace:
-- attach files/screenshots inline, generate side-panel drafts the attorney can
-- read/edit/download, and — on leaving — distill the session into an organized
-- attorney-facing digest on the case file. Everything here is attorney
-- work-product: attorney-only, own-rows, and never surfaced to the client.

-- ── 1. Inline attachments on workspace messages ─────────────────────────────
-- A message can carry one or more files the attorney dropped into the chat.
-- Each entry: { fileName, storagePath, mimeType }. Stored on the message so the
-- transcript can re-render the chip and re-fetch the file later.
alter table attorney_workspace_messages
  add column if not exists attachments jsonb not null default '[]'::jsonb;

-- ── 2. Freestyle drafts — the split-screen right panel ──────────────────────
-- Working documents the associate produced (or the attorney started) during a
-- freestyle session. These are NOT the client's `documents` record; they are
-- attorney scratch drafts, editable and downloadable in place.
create table if not exists attorney_workspace_drafts (
  id            uuid default gen_random_uuid() primary key,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  attorney_id   uuid references profiles(id) on delete cascade not null,
  title         text not null default 'Untitled draft',
  content       text not null default '',
  -- 'assistant' = emitted by the associate; 'attorney' = created/edited by hand.
  source        text not null default 'assistant' check (source in ('assistant', 'attorney')),
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

create index if not exists attorney_workspace_drafts_scope_idx
  on attorney_workspace_drafts (case_file_id, attorney_id, updated_at desc);

alter table attorney_workspace_drafts enable row level security;

-- Only attorneys, and only their own drafts. Reuses the stage-11
-- public.is_attorney() SECURITY DEFINER helper to avoid RLS recursion.
drop policy if exists "attorneys_read_own_drafts" on attorney_workspace_drafts;
create policy "attorneys_read_own_drafts"
  on attorney_workspace_drafts for select
  using (public.is_attorney() and attorney_id = auth.uid());

drop policy if exists "attorneys_insert_own_drafts" on attorney_workspace_drafts;
create policy "attorneys_insert_own_drafts"
  on attorney_workspace_drafts for insert
  with check (public.is_attorney() and attorney_id = auth.uid());

drop policy if exists "attorneys_update_own_drafts" on attorney_workspace_drafts;
create policy "attorneys_update_own_drafts"
  on attorney_workspace_drafts for update
  using (public.is_attorney() and attorney_id = auth.uid())
  with check (public.is_attorney() and attorney_id = auth.uid());

drop policy if exists "attorneys_delete_own_drafts" on attorney_workspace_drafts;
create policy "attorneys_delete_own_drafts"
  on attorney_workspace_drafts for delete
  using (public.is_attorney() and attorney_id = auth.uid());

-- ── 3. Organized session digest on the case file ────────────────────────────
-- When the attorney leaves freestyle, the session (messages + drafts) is
-- distilled into a plain-language digest and stored here — the "updates the
-- Living File" step. Attorney-facing working notes, not client narrative.
alter table case_files
  add column if not exists attorney_workspace_summary text;
alter table case_files
  add column if not exists attorney_workspace_summarized_at timestamptz;
