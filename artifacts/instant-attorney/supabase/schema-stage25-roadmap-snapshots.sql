-- Instant Attorney — Stage 25 Schema Additions
-- Run this AFTER schema-stage24-secure-ref.sql in the Supabase SQL editor.
--
-- Roadmap AI overlay cache: one row per case file. Tier-1/Tier-2 roadmaps are
-- computed deterministically on every render; this table stores only the optional
-- Tier-3 AI overlay (stage notes, consult nudge) keyed by file_fingerprint so
-- redundant model calls are skipped when nothing material changed.
--
-- Idempotent — safe to re-run.

create table if not exists roadmap_snapshots (
  id                  uuid default gen_random_uuid() primary key,
  case_file_id        uuid references case_files(id) on delete cascade not null,
  user_id             uuid references profiles(id) on delete cascade not null,
  file_fingerprint    text not null,
  blueprint_key       text not null,
  blueprint_version   text not null default '1',
  ai_overlay          jsonb not null default '{}'::jsonb,
  generated_at        timestamptz default now() not null,
  updated_at          timestamptz default now() not null,
  unique (case_file_id)
);

create index if not exists roadmap_snapshots_user_idx on roadmap_snapshots (user_id);

alter table roadmap_snapshots enable row level security;

drop policy if exists "users_read_own_roadmap_snapshots" on roadmap_snapshots;
create policy "users_read_own_roadmap_snapshots"
  on roadmap_snapshots for select using (auth.uid() = user_id);

drop policy if exists "users_upsert_own_roadmap_snapshots" on roadmap_snapshots;
create policy "users_upsert_own_roadmap_snapshots"
  on roadmap_snapshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "attorneys_read_all_roadmap_snapshots" on roadmap_snapshots;
create policy "attorneys_read_all_roadmap_snapshots"
  on roadmap_snapshots for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );
