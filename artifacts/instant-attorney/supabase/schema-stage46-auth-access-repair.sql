-- Instant Attorney — Stage 46: auth access repair
-- Paste this ENTIRE file into Supabase → SQL Editor → Run.
-- Idempotent: safe to re-run.
--
-- Fixes the ways a real, paid-up account can end up unable to get in:
--
--   1. subscriptions.status never learned about 'bypass' on projects whose
--      table predates it. schema.sql declares the constraint inline under
--      `create table if not exists`, so an existing table never picked the
--      value up — and the QA-tester grant (lib/testers.ts) writes exactly
--      that status. The insert fails silently and the tester is bounced to
--      the Stripe paywall on every page.
--   2. The unique index on subscriptions.user_id that every `upsert(...,
--      { onConflict: "user_id" })` in the app depends on may be missing.
--   3. auth.users rows created before the on_auth_user_created trigger
--      existed have no profiles row. subscriptions.user_id references
--      profiles(id), so the bypass grant hits a foreign-key violation, and
--      the dashboard reads a null profile.
--   4. The trigger itself may have been dropped by a manual auth reset.

-- ── 1. subscriptions.status must allow 'bypass' ────────────────────────────
alter table subscriptions drop constraint if exists subscriptions_status_check;
alter table subscriptions add constraint subscriptions_status_check
  check (status in ('active', 'canceled', 'past_due', 'trialing', 'bypass'));

-- ── 2. subscriptions.plan must allow every tier in use ─────────────────────
alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('phase2', 'consult', 'attorney_pro'));

-- ── 3. onConflict target for subscription upserts ──────────────────────────
create unique index if not exists subscriptions_user_id_unique
  on subscriptions (user_id);

-- ── 4. Backfill profiles for any auth user missing one ─────────────────────
insert into public.profiles (id, email, full_name, account_type, attorney_user_status)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  case when coalesce(u.raw_user_meta_data->>'account_type', 'client') = 'attorney_user'
       then 'attorney_user' else 'client' end,
  case when coalesce(u.raw_user_meta_data->>'account_type', 'client') = 'attorney_user'
       then 'pending' else null end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null;

-- ── 5. Re-assert the signup trigger (function body owned by stage 33) ──────
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 6. QA testers: confirm the address and grant the bypass subscription ───
-- Keep this list in sync with TESTER_EMAILS in lib/testers.ts. Confirming
-- here makes access independent of transactional email actually arriving —
-- Supabase's built-in SMTP is rate-limited and its links expire.
with testers as (
  select id, email from auth.users
  where lower(email) in ('vicky.crawford12@gmail.com')
)
-- Only email_confirmed_at is written: auth.users.confirmed_at is a generated
-- column on current Supabase and rejects any direct update.
update auth.users u
set email_confirmed_at = now()
from testers t
where u.id = t.id
  and u.email_confirmed_at is null;

insert into public.subscriptions (user_id, status, plan, current_period_end)
select p.id, 'bypass', 'phase2', null
from public.profiles p
where lower(p.email) in ('vicky.crawford12@gmail.com')
on conflict (user_id) do update
  set status = 'bypass',
      plan   = case when subscriptions.plan = 'consult' then 'consult' else 'phase2' end,
      updated_at = now()
  where subscriptions.status not in ('active', 'trialing', 'bypass');

-- ── 7. Report ──────────────────────────────────────────────────────────────
select
  u.email,
  (u.email_confirmed_at is not null) as email_confirmed,
  (p.id is not null)                 as has_profile,
  s.status                           as subscription_status,
  s.plan                             as subscription_plan
from auth.users u
left join public.profiles p on p.id = u.id
left join public.subscriptions s on s.user_id = u.id
where lower(u.email) in ('vicky.crawford12@gmail.com');
