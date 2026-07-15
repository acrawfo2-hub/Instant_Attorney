-- Instant Attorney — Stage 37: Client home-state for UPL / jurisdiction gating
-- Run AFTER schema-stage36-brainstorm.sql in the Supabase SQL editor
--
-- Captures the client's home (or primary matter) state so onboarding and intake
-- can surface a clear notice when the matter is outside TX/IL, where Crawford Law
-- PLLC is licensed. Soft gate: general information remains available; Phase II
-- representation messaging is scoped.

alter table profiles
  add column if not exists home_state text;

comment on column profiles.home_state is
  'US state/territory code (or OTHER). Used for UPL notices; TX and IL are licensed.';

-- Extend the column-scoped UPDATE grant from stage34 so clients can save this
-- field through the profile API (service-role writes also work for onboarding).
grant update (full_name, phone, bar_number, firm_name, home_state) on profiles to authenticated;
