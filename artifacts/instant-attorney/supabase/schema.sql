-- Instant Attorney — Stage 1 Schema
-- Run this in the Supabase SQL editor after creating your project.
--
-- Full migration order:
--   1. schema.sql
--   2. schema-stage2.sql … schema-stage9.sql
--   3. schema-verify.sql (confirm everything is OK)
-- Then: update profiles set is_attorney = true where email = 'your@email';

-- Enable UUID extension (usually already enabled on Supabase)
create extension if not exists "uuid-ossp";

-- ── Profiles (extends auth.users) ──────────────────────────────────────────
create table if not exists profiles (
  id           uuid references auth.users(id) on delete cascade primary key,
  email        text not null,
  full_name    text,
  phone        text,
  created_at   timestamptz default now() not null,
  updated_at   timestamptz default now() not null
);

alter table profiles enable row level security;

create policy "users_read_own_profile"
  on profiles for select using (auth.uid() = id);

create policy "users_update_own_profile"
  on profiles for update using (auth.uid() = id);

-- ── Representation agreements ───────────────────────────────────────────────
create table if not exists representation_agreements (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references profiles(id) on delete cascade not null,
  signature_name      text not null,
  agreement_version   text not null default '1.0',
  signed_at           timestamptz default now() not null
);

alter table representation_agreements enable row level security;

create policy "users_read_own_agreements"
  on representation_agreements for select using (auth.uid() = user_id);

create policy "users_insert_own_agreements"
  on representation_agreements for insert with check (auth.uid() = user_id);

-- ── AI consents ─────────────────────────────────────────────────────────────
create table if not exists ai_consents (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references profiles(id) on delete cascade not null,
  consent_version  text not null default '1.0',
  signed_at        timestamptz default now() not null
);

alter table ai_consents enable row level security;

create policy "users_read_own_consents"
  on ai_consents for select using (auth.uid() = user_id);

create policy "users_insert_own_consents"
  on ai_consents for insert with check (auth.uid() = user_id);

-- ── Subscriptions ───────────────────────────────────────────────────────────
create table if not exists subscriptions (
  id                      uuid default gen_random_uuid() primary key,
  user_id                 uuid references profiles(id) on delete cascade not null,
  stripe_customer_id      text,
  stripe_subscription_id  text,
  status                  text not null default 'active'
    check (status in ('active', 'canceled', 'past_due', 'trialing', 'bypass')),
  plan                    text not null default 'phase2'
    check (plan in ('phase2', 'consult')),
  current_period_end      timestamptz,
  created_at              timestamptz default now() not null,
  updated_at              timestamptz default now() not null
);

alter table subscriptions enable row level security;

create policy "users_read_own_subscriptions"
  on subscriptions for select using (auth.uid() = user_id);

-- Required for Stripe checkout / webhook upserts (onConflict: user_id)
create unique index if not exists subscriptions_user_id_unique
  on subscriptions (user_id);

-- ── Case files (Living File) ────────────────────────────────────────────────
create table if not exists case_files (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references profiles(id) on delete cascade not null,
  matter_type         text check (matter_type in ('reactive', 'preventive')),
  matter_subtype      text,
  status              text not null default 'open'
    check (status in ('open', 'closed', 'referred')),
  goals               jsonb not null default '[]',
  attorney_assessment text,
  next_action         text,
  opened_at           timestamptz default now() not null,
  updated_at          timestamptz default now() not null
);

alter table case_files enable row level security;

create policy "users_read_own_case_files"
  on case_files for select using (auth.uid() = user_id);

create policy "users_insert_own_case_files"
  on case_files for insert with check (auth.uid() = user_id);

create policy "users_update_own_case_files"
  on case_files for update using (auth.uid() = user_id);

-- ── Fact items (confirmed facts + gaps) ────────────────────────────────────
create table if not exists fact_items (
  id             uuid default gen_random_uuid() primary key,
  case_file_id   uuid references case_files(id) on delete cascade not null,
  user_id        uuid references profiles(id) on delete cascade not null,
  description    text not null,
  status         text not null default 'gap'
    check (status in ('confirmed', 'gap')),
  kind           text not null default 'fact'
    check (kind in ('fact', 'hypothetical')),
  created_at     timestamptz default now() not null,
  updated_at     timestamptz default now() not null
);

alter table fact_items enable row level security;

create policy "users_manage_own_fact_items"
  on fact_items for all using (auth.uid() = user_id);

-- ── Intake messages (ACP-protected Phase II chat) ──────────────────────────
create table if not exists intake_messages (
  id             uuid default gen_random_uuid() primary key,
  case_file_id   uuid references case_files(id) on delete cascade not null,
  user_id        uuid references profiles(id) on delete cascade not null,
  role           text not null check (role in ('user', 'assistant')),
  content        text not null,
  created_at     timestamptz default now() not null
);

alter table intake_messages enable row level security;

create policy "users_read_own_messages"
  on intake_messages for select using (auth.uid() = user_id);

create policy "users_insert_own_messages"
  on intake_messages for insert with check (auth.uid() = user_id);

-- Durable ACP turn queue and per-client delivery cursor.
create table if not exists chat_acp_jobs (
  id uuid primary key default gen_random_uuid(),
  case_file_id uuid not null references case_files(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  sequence bigint not null,
  predecessor_id uuid references chat_acp_jobs(id) on delete set null,
  state text not null check (state in ('queued', 'running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  final_text text,
  truncated boolean not null default false,
  assistant_message_id uuid references intake_messages(id) on delete set null,
  unique (case_file_id, sequence)
);
create index if not exists chat_acp_jobs_discovery_idx
  on chat_acp_jobs (case_file_id, user_id, sequence);
alter table chat_acp_jobs enable row level security;
create policy "users_read_own_chat_jobs" on chat_acp_jobs for select using (auth.uid() = user_id);
create policy "users_insert_own_chat_jobs" on chat_acp_jobs for insert with check (auth.uid() = user_id);
create policy "users_update_own_chat_jobs" on chat_acp_jobs for update using (auth.uid() = user_id);

-- Allocate a case sequence under an advisory transaction lock so simultaneous
-- browser sends cannot choose the same tail.
create or replace function create_chat_acp_job(p_id uuid, p_case_file_id uuid, p_user_id uuid)
returns chat_acp_jobs language plpgsql security invoker as $$
declare created chat_acp_jobs;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_case_file_id::text, 0));
  insert into chat_acp_jobs (id, case_file_id, user_id, sequence, predecessor_id, state)
  select p_id, p_case_file_id, p_user_id, coalesce(max(sequence), 0) + 1,
    (array_agg(id order by sequence desc) filter (where state in ('queued', 'running')))[1],
    case when count(*) filter (where state in ('queued', 'running')) > 0 then 'queued' else 'running' end
  from chat_acp_jobs where case_file_id = p_case_file_id and user_id = p_user_id
  returning * into created;
  return created;
end $$;

create table if not exists chat_acp_acknowledgments (
  case_file_id uuid not null references case_files(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  acknowledged_sequence bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key (case_file_id, user_id)
);
alter table chat_acp_acknowledgments enable row level security;
create policy "users_manage_own_chat_ack" on chat_acp_acknowledgments for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);


-- ── Auto-create profile on signup ──────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
