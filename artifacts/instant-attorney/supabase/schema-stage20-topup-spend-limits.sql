-- Instant Attorney — Stage 20 Schema Additions
-- Run this AFTER schema-stage19-token-topups.sql in the Supabase SQL editor.
--
-- Adds user-controlled spending limits to the automatic token top-up engine
-- (modeled on Replit / Claude Code spend caps):
--   • monthly_topup_limit_usd — the user's pre-approved ceiling on automatic
--     top-ups per calendar month. Top-ups auto-charge silently up to this cap;
--     once month-to-date top-ups would exceed it, the ledger pauses (blocked
--     with block_reason = 'limit_reached') until the user raises the cap.
--   • month_topup_usd — month-to-date successful top-up spend (resets monthly).
--   • block_reason — distinguishes 'limit_reached' (raise limit) from
--     'topup_failed' (update card) so the UI can show the right call to action.

alter table top_up_ledger
  add column if not exists monthly_topup_limit_usd numeric(12, 2),
  add column if not exists month_topup_usd          numeric(12, 2) not null default 0,
  add column if not exists block_reason             text
    check (block_reason in ('limit_reached', 'topup_failed'));

-- Backfill the pre-approved cap for existing customers from the configured
-- default so nobody starts at an unlimited (or zero) cap unexpectedly.
update top_up_ledger
  set monthly_topup_limit_usd = 25.00
  where monthly_topup_limit_usd is null;
