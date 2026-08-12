-- Instant Attorney — Stage 47: admin console foundation
-- Paste this ENTIRE file into Supabase → SQL Editor → Run.
-- Idempotent: safe to re-run.
--
-- Adds the audit trail the admin console writes to. Every service-role repair
-- run from /admin (set a password, confirm an email, grant a subscription)
-- lands here with who did it, to whom, and why.
--
-- Design notes:
--
--   * actor_id is deliberately NOT a foreign key to profiles. The console has a
--     break-glass auth path (ADMIN_EMAILS) precisely for the case where the
--     profiles table is unreadable or a row is missing — an audit log that
--     refuses the insert in exactly that situation is worse than useless.
--     actor_email is stored alongside so the row is self-describing.
--   * No RLS policies are declared. The table is service-role only; the console
--     reads it through the service client behind the admin gate. RLS stays
--     enabled so an anon/authenticated key can never reach it.

create table if not exists admin_audit_log (
  id             uuid default gen_random_uuid() primary key,
  actor_id       uuid,
  actor_email    text,
  -- How the actor was authorised: 'profile' (profiles.is_attorney),
  -- 'break-glass' (ADMIN_EMAILS env allowlist), or 'bypass' (non-production
  -- BYPASS_AUTH). Recorded so a break-glass action is visibly a break-glass
  -- action forever after.
  actor_via      text not null default 'profile'
    check (actor_via in ('profile', 'break-glass', 'bypass')),
  action         text not null,
  target_user_id uuid,
  target_email   text,
  reason         text,
  detail         jsonb,
  outcome        text not null default 'ok'
    check (outcome in ('ok', 'failed')),
  error          text,
  created_at     timestamptz default now() not null
);

alter table admin_audit_log enable row level security;

create index if not exists admin_audit_log_created_at_idx
  on admin_audit_log (created_at desc);

create index if not exists admin_audit_log_target_idx
  on admin_audit_log (target_user_id, created_at desc);

create index if not exists admin_audit_log_action_idx
  on admin_audit_log (action, created_at desc);

-- ── Report ─────────────────────────────────────────────────────────────────
select 'admin_audit_log' as object, case when exists (
  select 1 from information_schema.tables
  where table_schema = 'public' and table_name = 'admin_audit_log'
) then 'OK' else 'MISSING' end as status;
