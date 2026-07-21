-- Instant Attorney — Stage 33: Attorney-user mode
-- Run AFTER schema-stage32-pdf-templates.sql in the Supabase SQL editor
--
-- Adds a third account persona alongside the ordinary lay "client" and the
-- firm's own reviewing attorney (profiles.is_attorney, unchanged): an
-- external/small-firm attorney who subscribes to use the drafting wizards as
-- a professional tool for their own clients' matters. Kept as its own field —
-- never conflated with is_attorney, which still means "Andrew Crawford" and
-- must keep meaning only that (it drives his global cross-user RLS access
-- and his internal second-draft/critical-review tooling).

-- ── Account type + manual-approval gate on profiles ─────────────────────────
alter table profiles
  add column if not exists account_type text not null default 'client'
    check (account_type in ('client', 'attorney_user'));

alter table profiles
  add column if not exists attorney_user_status text
    check (attorney_user_status is null or attorney_user_status in ('pending', 'approved', 'rejected'));

alter table profiles
  add column if not exists bar_number text;

alter table profiles
  add column if not exists firm_name text;

-- ── Subscriptions: new plan tier for the attorney toolkit ──────────────────
alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('phase2', 'consult', 'attorney_pro'));

-- ── Auto-create profile on signup: carry account_type from signup metadata ──
-- A signup started via the attorney entry point passes
-- options.data.account_type = 'attorney_user'; everyone else keeps the
-- 'client' default. An attorney_user starts 'pending' until manually approved.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  requested_type text := coalesce(new.raw_user_meta_data->>'account_type', 'client');
begin
  insert into public.profiles (id, email, full_name, account_type, attorney_user_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when requested_type = 'attorney_user' then 'attorney_user' else 'client' end,
    case when requested_type = 'attorney_user' then 'pending' else null end
  );
  return new;
end;
$$ language plpgsql security definer;

-- ── Attorney-user subscriber agreement (parallel to representation_agreements) ──
-- A separate table, not a shared "agreement_type" column on
-- representation_agreements: this is NOT a representation agreement (no
-- attorney-client relationship forms), so it deliberately does not share that
-- table's name/semantics. Andrew Crawford authors the actual terms text that
-- gets signed here — see app/onboarding/attorney/page.tsx.
create table if not exists attorney_subscriber_agreements (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references profiles(id) on delete cascade not null,
  signature_name      text not null,
  agreement_version   text not null default '1.0',
  signed_at           timestamptz default now() not null
);

alter table attorney_subscriber_agreements enable row level security;

drop policy if exists "users_read_own_attorney_subscriber_agreements" on attorney_subscriber_agreements;
create policy "users_read_own_attorney_subscriber_agreements"
  on attorney_subscriber_agreements for select using (auth.uid() = user_id);

drop policy if exists "users_insert_own_attorney_subscriber_agreements" on attorney_subscriber_agreements;
create policy "users_insert_own_attorney_subscriber_agreements"
  on attorney_subscriber_agreements for insert with check (auth.uid() = user_id);

-- Andrew (is_attorney) needs to see pending signups to approve/reject them.
drop policy if exists "attorneys_read_all_attorney_subscriber_agreements" on attorney_subscriber_agreements;
create policy "attorneys_read_all_attorney_subscriber_agreements"
  on attorney_subscriber_agreements for select
  using (public.is_attorney());
