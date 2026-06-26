-- Instant Attorney — Stage 9 Schema Additions
-- Run this AFTER schema-stage8.sql in the Supabase SQL editor
-- Usage tracking for AI tokens and infrastructure (storage) costs.
-- Billing / Stripe overage charges are NOT enabled yet — instrumentation only.

-- ── Granular usage events ───────────────────────────────────────────────────
create table if not exists usage_events (
  id              uuid default gen_random_uuid() primary key,
  user_id         uuid references profiles(id) on delete cascade not null,
  actor_id        uuid references profiles(id) on delete set null,
  case_file_id    uuid references case_files(id) on delete set null,
  category        text not null check (category in ('ai', 'storage', 'infra')),
  feature         text not null,
  model           text,
  input_tokens    integer,
  output_tokens   integer,
  bytes           bigint,
  cost_usd        numeric(12, 6) not null,
  billable        boolean not null default true,
  metadata        jsonb not null default '{}',
  created_at      timestamptz default now() not null
);

create index if not exists usage_events_user_id_created_at_idx
  on usage_events (user_id, created_at desc);

create index if not exists usage_events_case_file_id_idx
  on usage_events (case_file_id)
  where case_file_id is not null;

create index if not exists usage_events_feature_idx
  on usage_events (feature);

alter table usage_events enable row level security;

create policy "users_read_own_usage_events"
  on usage_events for select using (auth.uid() = user_id);

create policy "attorneys_read_all_usage_events"
  on usage_events for select using (
    exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );

-- ── Per-user billing-period rollups (updated on each event) ─────────────────
create table if not exists usage_period_totals (
  user_id           uuid references profiles(id) on delete cascade not null,
  period_start      timestamptz not null,
  period_end        timestamptz not null,
  ai_cost_usd       numeric(12, 6) not null default 0,
  storage_cost_usd  numeric(12, 6) not null default 0,
  infra_cost_usd    numeric(12, 6) not null default 0,
  total_cost_usd    numeric(12, 6) not null default 0,
  event_count       integer not null default 0,
  updated_at        timestamptz default now() not null,
  primary key (user_id, period_start)
);

create index if not exists usage_period_totals_user_period_end_idx
  on usage_period_totals (user_id, period_end desc);

alter table usage_period_totals enable row level security;

create policy "users_read_own_usage_period_totals"
  on usage_period_totals for select using (auth.uid() = user_id);

create policy "attorneys_read_all_usage_period_totals"
  on usage_period_totals for select using (
    exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );
