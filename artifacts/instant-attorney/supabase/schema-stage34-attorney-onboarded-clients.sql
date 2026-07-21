-- Instant Attorney — Stage 34: attorney-onboarded client files
-- Run this in the Supabase SQL editor (production project).
--
-- Lets the reviewing attorney onboard a client from their regular practice
-- directly into an ACP-protected case file: upload files/emails, chat to build
-- the Living File, and use every client-side feature (drafting, review, etc.).
-- The file is owned by the ATTORNEY's account (case_files.user_id = attorney),
-- flagged here, and carries the real client's display identity for reference.
-- Only the attorney sees it for now — it's their own account's file.
--
-- Backward compatible & idempotent: existing rows default to created_by_attorney
-- = false (normal client-originated files).

alter table case_files
  add column if not exists created_by_attorney boolean not null default false,
  add column if not exists client_display_name text,
  add column if not exists client_email text;
