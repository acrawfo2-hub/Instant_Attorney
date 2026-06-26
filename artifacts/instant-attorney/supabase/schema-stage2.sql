-- Instant Attorney — Stage 2 Schema Additions
-- Run this AFTER schema.sql in the Supabase SQL editor

-- ── Attorney flag on profiles ───────────────────────────────────────────────
alter table profiles add column if not exists is_attorney boolean not null default false;

-- ── Summary + legal strategy on case files ──────────────────────────────────
alter table case_files add column if not exists summary text;
alter table case_files add column if not exists legal_strategy jsonb not null default '{}';

-- ── Documents ───────────────────────────────────────────────────────────────
create table if not exists documents (
  id                  uuid default gen_random_uuid() primary key,
  case_file_id        uuid references case_files(id) on delete cascade not null,
  user_id             uuid references profiles(id) on delete cascade not null,
  doc_type            text not null,  -- 'intake_summary' | 'demand_letter' | ...
  title               text not null,
  status              text not null default 'draft'
    check (status in ('draft', 'pending_review', 'approved', 'changes_requested', 'delivered')),
  content_json        jsonb not null default '{}',  -- wizard answers + structured data
  file_path           text,                          -- storage path for generated .docx
  attorney_notes      text,
  reviewed_by         uuid references profiles(id),
  reviewed_at         timestamptz,
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null
);

alter table documents enable row level security;

create policy "users_read_own_documents"
  on documents for select using (auth.uid() = user_id);

create policy "users_insert_own_documents"
  on documents for insert with check (auth.uid() = user_id);

drop policy if exists "users_update_own_documents" on documents;
create policy "users_update_own_documents"
  on documents for update
  using (auth.uid() = user_id);

create policy "attorneys_read_all_documents"
  on documents for select
  using (
    exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );

create policy "attorneys_update_documents"
  on documents for update
  using (
    exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );

-- ── Attorney can read all case files ────────────────────────────────────────
create policy "attorneys_read_all_case_files"
  on case_files for select
  using (
    exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );

-- ── Attorney can read all profiles ──────────────────────────────────────────
create policy "attorneys_read_all_profiles"
  on profiles for select
  using (
    exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );

-- ── Attorney can read all fact items ────────────────────────────────────────
create policy "attorneys_read_all_fact_items"
  on fact_items for select
  using (
    exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );

-- ── Attorney can update case files (assessment, next_action) ────────────────
create policy "attorneys_update_case_files"
  on case_files for update
  using (
    exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );
