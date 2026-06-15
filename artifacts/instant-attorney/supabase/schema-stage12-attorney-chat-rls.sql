-- Instant Attorney — Stage 12: let attorneys read all intake chat transcripts
-- Run this in the Supabase SQL editor (production project).
--
-- The attorney client-file page now surfaces each client's intake_messages
-- transcript. The only SELECT policies on intake_messages are the per-user
-- "users_read_own_messages" ones, so an attorney's session cannot read other
-- users' chats and the transcript section renders empty.
--
-- Fix: add an attorney SELECT policy that reuses the existing
-- public.is_attorney() SECURITY DEFINER helper (added in stage 11), which
-- avoids the RLS recursion problem.

drop policy if exists "attorneys_read_all_intake_messages" on intake_messages;
create policy "attorneys_read_all_intake_messages"
  on intake_messages for select
  using (public.is_attorney());
