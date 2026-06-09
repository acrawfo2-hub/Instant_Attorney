-- Instant Attorney — Stage 4 Schema Additions
-- Run this AFTER schema-stage3.sql in the Supabase SQL editor

-- ── Supabase Storage setup ───────────────────────────────────────────────────
-- In the Supabase dashboard, create a private storage bucket named:
--   case-attachments
-- Then run these storage policies in the SQL editor:
--
-- insert into storage.buckets (id, name, public) values ('case-attachments', 'case-attachments', false);
--
-- create policy "users_upload_own_attachments"
--   on storage.objects for insert
--   with check (bucket_id = 'case-attachments' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "users_read_own_attachments"
--   on storage.objects for select
--   using (bucket_id = 'case-attachments' and auth.uid()::text = (storage.foldername(name))[1]);
--
-- create policy "service_role_full_access"
--   on storage.objects for all
--   using (bucket_id = 'case-attachments');
-- ── (service role bypasses RLS automatically) ────────────────────────────────

-- ── Attachments ─────────────────────────────────────────────────────────────
create table if not exists attachments (
  id               uuid default gen_random_uuid() primary key,
  case_file_id     uuid references case_files(id) on delete cascade not null,
  user_id          uuid references profiles(id) on delete cascade not null,
  file_name        text not null,
  file_type        text not null,
  file_size        integer not null,
  storage_path     text not null,
  attachment_type  text not null default 'document'
    check (attachment_type in ('document', 'screenshot', 'other')),
  status           text not null default 'processing'
    check (status in ('processing', 'ready', 'failed')),
  ai_summary       text,
  case_relevance   text,
  key_sections     jsonb not null default '[]',
  urgent_findings  text,
  created_at       timestamptz default now() not null,
  updated_at       timestamptz default now() not null
);

alter table attachments enable row level security;

create policy "users_manage_own_attachments"
  on attachments for all using (auth.uid() = user_id);

create policy "attorneys_read_all_attachments"
  on attachments for select
  using (exists (select 1 from profiles where id = auth.uid() and is_attorney = true));

-- ── Multi-file support: title, file_type, archive_at ────────────────────────
alter table case_files
  add column if not exists title      text,
  add column if not exists file_type  text not null default 'standard',
  add column if not exists archive_at timestamptz;

create index if not exists case_files_archive_at_idx
  on case_files (archive_at)
  where archive_at is not null;

-- ── Requested attachments (AI-generated checklist, attorney-addable later) ──
create table if not exists requested_attachments (
  id           uuid default gen_random_uuid() primary key,
  case_file_id uuid references case_files(id) on delete cascade not null,
  user_id      uuid references profiles(id) on delete cascade not null,
  description  text not null,
  reason       text,
  status       text not null default 'requested'
    check (status in ('requested', 'uploaded', 'waived')),
  fulfilled_by uuid references attachments(id),
  source       text not null default 'ai'
    check (source in ('ai', 'attorney')),
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

alter table requested_attachments enable row level security;

create policy "users_manage_own_requested"
  on requested_attachments for all using (auth.uid() = user_id);

create policy "attorneys_manage_all_requested"
  on requested_attachments for all
  using (exists (select 1 from profiles where id = auth.uid() and is_attorney = true));
