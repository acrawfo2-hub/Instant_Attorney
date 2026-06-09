-- Instant Attorney — Stage 3 Schema Additions
-- Run this AFTER schema-stage2.sql in the Supabase SQL editor

-- ── Jurisdiction on case files ───────────────────────────────────────────────
alter table case_files add column if not exists jurisdiction text;

-- ── Draft text on documents (AI-formatted near-final text) ──────────────────
alter table documents add column if not exists draft_text text;

-- ── Expand documents.status to include pre_warmed ───────────────────────────
-- Drop and recreate the check constraint to add the new status value
alter table documents drop constraint if exists documents_status_check;
alter table documents add constraint documents_status_check
  check (status in ('pre_warmed', 'draft', 'pending_review', 'approved', 'changes_requested', 'delivered'));
