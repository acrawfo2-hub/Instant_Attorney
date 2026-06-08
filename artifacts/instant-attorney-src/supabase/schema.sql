-- Instant Attorney — Stage 1 Schema
-- Run this in the Supabase SQL editor after creating your project

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
