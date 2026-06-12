-- Instant Attorney — Stage 7 Schema Additions
-- Run this AFTER schema-stage6.sql in the Supabase SQL editor

-- ── Consults (attorney scheduling queue) ─────────────────────────────────────
-- Source of truth for consults the attorney needs to schedule and consults
-- already on the pending schedule. Surfaced on the attorney dashboard.
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
