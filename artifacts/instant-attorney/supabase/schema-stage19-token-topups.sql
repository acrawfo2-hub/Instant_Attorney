-- Instant Attorney — Stage 19 Schema Additions
-- Run this AFTER schema-stage18-doc-facts-synced.sql in the Supabase SQL editor.
--
-- Activates subscription + automatic token top-up billing:
--   • Per-customer top-up ledger (cumulative billable AI COGS since last top-up)
--   • Idempotent top-up charge records (one charge per ledger cycle)
--   • Stripe webhook event de-duplication
--   • billing_exempt flag so specific users (e.g. internal testers) stay free
--
-- Economics (defaults): trigger at $5.00 of model COGS, charge $8.50.
-- After Stripe fees (2.9% + $0.30) the 35% gross-margin floor holds only while
-- a cycle's COGS stays <= ~$4.98 — see billing-config.ts topUpMarginPct(). The
-- pre-call gate bounds overshoot to at most one in-flight call.

-- ── Free / exempt users ─────────────────────────────────────────────────────
-- Exempt users never accrue a top-up meter and are never charged or blocked.
alter table profiles
  add column if not exists billing_exempt boolean not null default false;

-- Keep Vicky on the free internal-tester path. Safe to re-run.
update profiles set billing_exempt = true
  where email = 'vicky.crawford12@gmail.com';

-- ── Per-customer top-up ledger ──────────────────────────────────────────────
-- meter_usd  = billable AI COGS accumulated since the last SUCCESSFUL top-up,
--              after the monthly included allowance is drawn down.
-- status     = 'ok'      → serving normally
--              'pending' → a top-up charge is in flight (gate blocks further AI)
--              'blocked' → last top-up failed; user must update card / retry
-- cycle_id   = identifies the current top-up cycle; the unique key that makes
--              charge creation idempotent under concurrent usage events.
create table if not exists top_up_ledger (
  user_id                uuid primary key references profiles(id) on delete cascade,
  meter_usd              numeric(12, 6) not null default 0,
  status                 text not null default 'ok'
    check (status in ('ok', 'pending', 'blocked')),
  cycle_id               uuid not null default gen_random_uuid(),
  -- Monthly included allowance accounting (defaults to $0 = meter from $0).
  allowance_used_usd     numeric(12, 6) not null default 0,
  allowance_period_start timestamptz not null default date_trunc('month', now()),
  -- Lifetime counters for reporting / margin auditing.
  total_topups           integer not null default 0,
  total_topup_usd        numeric(12, 2) not null default 0,
  updated_at             timestamptz default now() not null
);

alter table top_up_ledger enable row level security;

create policy "users_read_own_top_up_ledger"
  on top_up_ledger for select using (auth.uid() = user_id);

create policy "attorneys_read_all_top_up_ledger"
  on top_up_ledger for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );

-- ── Top-up charges (one row per ledger cycle = idempotency boundary) ─────────
create table if not exists top_up_charges (
  id                       uuid default gen_random_uuid() primary key,
  user_id                  uuid references profiles(id) on delete cascade not null,
  cycle_id                 uuid not null,
  stripe_payment_intent_id text,
  amount_usd               numeric(12, 2) not null,
  cogs_at_trigger_usd      numeric(12, 6) not null default 0,
  status                   text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'skipped')),
  failure_reason           text,
  created_at               timestamptz default now() not null,
  settled_at               timestamptz
);

-- Exactly one charge per (user, cycle): the DB-level guard against
-- double-triggering a top-up when usage events race.
create unique index if not exists top_up_charges_user_cycle_unique
  on top_up_charges (user_id, cycle_id);

create index if not exists top_up_charges_payment_intent_idx
  on top_up_charges (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table top_up_charges enable row level security;

create policy "users_read_own_top_up_charges"
  on top_up_charges for select using (auth.uid() = user_id);

create policy "attorneys_read_all_top_up_charges"
  on top_up_charges for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );

-- ── Stripe webhook de-duplication ───────────────────────────────────────────
-- Stripe may redeliver the same event; processing is gated on a successful
-- insert here so each event runs its side effects at most once.
create table if not exists stripe_webhook_events (
  event_id    text primary key,
  event_type  text not null,
  received_at timestamptz default now() not null
);

alter table stripe_webhook_events enable row level security;
-- No client policies: service-role only.
