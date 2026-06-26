-- Instant Attorney — Stage 26: Consult wrap-up (Phase B)
-- Run AFTER schema-stage25-roadmap-snapshots.sql in the Supabase SQL editor

alter table consult_requests
  add column if not exists attorney_notes text,
  add column if not exists wrap_up_draft jsonb,
  add column if not exists post_consult_plan jsonb,
  add column if not exists wrap_up_submitted_at timestamptz;
