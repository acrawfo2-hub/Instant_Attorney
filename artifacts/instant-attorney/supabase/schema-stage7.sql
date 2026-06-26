-- Instant Attorney — Stage 7 Schema Additions
-- Run this AFTER schema-stage6.sql in the Supabase SQL editor

-- ── Consults (LEGACY — superseded by consult_requests below) ───────────────
-- Retained for databases that already ran this migration. The app no longer
-- reads or writes this table; use consult_requests as the single source of truth.
create table if not exists consults (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  case_file_id    uuid references case_files(id) on delete set null,
  consult_type    text not null default 'standard'
    check (consult_type in ('standard', 'quick_consult', 'follow_up')),
  status          text not null default 'needs_scheduling'
    check (status in ('needs_scheduling', 'scheduled', 'completed', 'canceled')),
  scheduled_at    timestamptz,
  duration_minutes integer,
  location        text,
  notes           text,
  created_at      timestamptz default now() not null,
  updated_at      timestamptz default now() not null
);

create index if not exists consults_status_idx       on consults (status);
create index if not exists consults_scheduled_at_idx  on consults (scheduled_at);
create index if not exists consults_user_id_idx       on consults (user_id);

alter table consults enable row level security;

create policy "users_read_own_consults"
  on consults for select using (auth.uid() = user_id);

create policy "attorneys_manage_all_consults"
  on consults for all
  using (exists (select 1 from profiles where id = auth.uid() and is_attorney = true));

-- ── Consult requests (SOURCE OF TRUTH for consult scheduling) ───────────────
-- Client proposes 3 times → attorney confirms or counters → client accepts.
create table if not exists consult_requests (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references profiles(id) on delete cascade not null,
  case_file_id     uuid references case_files(id) on delete set null,
  status           text not null default 'pending'
                   check (status in ('pending','confirmed','attorney_proposed','cancelled','completed')),
  proposed_times   jsonb not null default '[]'::jsonb,
  confirmed_time   timestamptz,
  attorney_proposed_time timestamptz,
  client_phone     text,
  notes            text,
  created_at       timestamptz default now() not null,
  updated_at       timestamptz default now() not null
);

alter table consult_requests enable row level security;

create policy "clients_own_consults" on consult_requests
  for all using (auth.uid() = user_id);

create policy "attorneys_all_consults" on consult_requests
  for all using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );
