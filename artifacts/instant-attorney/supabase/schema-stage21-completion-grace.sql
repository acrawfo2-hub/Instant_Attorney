-- Instant Attorney — Stage 21 Schema Additions
-- Run this AFTER schema-stage20-topup-spend-limits.sql in the Supabase SQL editor.
--
-- Adds opt-in "completion grace" to the automatic token top-up engine. When a
-- customer's ledger is blocked (top-up pending, card failed, or monthly limit
-- reached) the pre-call gate normally refuses further AI spend. A customer who
-- opts in may instead consume a small, BOUNDED amount of additional model COGS
-- past the block so an in-flight document can always finish — "complete now,
-- pay later". The overshoot is never forgiven: it stays on meter_usd and is
-- collected on the next successful top-up, so gross margin is preserved and the
-- maximum exposure is exactly grace_buffer_usd.
--
--   • grace_opt_in     — customer enabled completion protection (default off).
--   • grace_buffer_usd — per-user override of the grace ceiling (USD of COGS).
--                        NULL = use the configured default (one top-up charge).
--   • grace_anchor_usd — meter_usd captured the moment the ledger entered a
--                        blocking state. Grace consumed = meter_usd - anchor;
--                        the gate stops once that reaches grace_buffer_usd.

alter table top_up_ledger
  add column if not exists grace_opt_in     boolean       not null default false,
  add column if not exists grace_buffer_usd numeric(12, 6),
  add column if not exists grace_anchor_usd numeric(12, 6);
