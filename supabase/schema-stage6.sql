-- Instant Attorney — Stage 6 Schema Additions
-- Run this AFTER schema-stage5.sql in the Supabase SQL editor

-- ── Attorney review columns on documents ────────────────────────────────────
alter table documents
  add column if not exists review_report        text,
  add column if not exists improved_draft_text  text,
  add column if not exists review_status        text
    check (review_status in ('reviewing', 'review_ready', 'merging', 'merged'));

-- ── Auto-document-review toggle on profiles ──────────────────────────────────
alter table profiles
  add column if not exists auto_document_review boolean not null default true;

-- ── Pre-consult memo on case_files ───────────────────────────────────────────
alter table case_files
  add column if not exists pre_consult_memo text;
