-- Instant Attorney — Stage 11: fix infinite recursion in RLS policies
-- Run this in the Supabase SQL editor (production project).
--
-- Problem: the attorney policies checked `exists (select 1 from profiles
-- where id = auth.uid() and is_attorney = true)`. Because one of those
-- policies lives ON the `profiles` table itself, selecting a profile row
-- re-triggered the same policy, which Postgres aborts with
-- "infinite recursion detected in policy for relation profiles" (42P17).
-- That broke EVERY profile read under RLS, so the /attorney gate could
-- never see is_attorney = true and always redirected attorneys to /dashboard.
--
-- Fix: move the attorney check into a SECURITY DEFINER function that reads
-- profiles with RLS bypassed (no recursion), then rewrite every attorney
-- policy to call it. This is the Supabase-recommended pattern.

-- ── Helper: is the current user an attorney? (RLS-safe) ─────────────────────
create or replace function public.is_attorney()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_attorney = true
  );
$$;

grant execute on function public.is_attorney() to authenticated, anon;

-- ── profiles (THE recursive one — critical fix) ─────────────────────────────
drop policy if exists "attorneys_read_all_profiles" on profiles;
create policy "attorneys_read_all_profiles"
  on profiles for select
  using (public.is_attorney());

-- ── documents ───────────────────────────────────────────────────────────────
drop policy if exists "attorneys_read_all_documents" on documents;
create policy "attorneys_read_all_documents"
  on documents for select
  using (public.is_attorney());

drop policy if exists "attorneys_update_documents" on documents;
create policy "attorneys_update_documents"
  on documents for update
  using (public.is_attorney());

-- ── case_files ───────────────────────────────────────────────────────────────
drop policy if exists "attorneys_read_all_case_files" on case_files;
create policy "attorneys_read_all_case_files"
  on case_files for select
  using (public.is_attorney());

drop policy if exists "attorneys_update_case_files" on case_files;
create policy "attorneys_update_case_files"
  on case_files for update
  using (public.is_attorney());

-- ── fact_items ───────────────────────────────────────────────────────────────
drop policy if exists "attorneys_read_all_fact_items" on fact_items;
create policy "attorneys_read_all_fact_items"
  on fact_items for select
  using (public.is_attorney());

-- ── attachments ──────────────────────────────────────────────────────────────
drop policy if exists "attorneys_read_all_attachments" on attachments;
create policy "attorneys_read_all_attachments"
  on attachments for select
  using (public.is_attorney());

-- ── requested_attachments ────────────────────────────────────────────────────
drop policy if exists "attorneys_manage_all_requested" on requested_attachments;
create policy "attorneys_manage_all_requested"
  on requested_attachments for all
  using (public.is_attorney());

-- ── consults (legacy) ────────────────────────────────────────────────────────
drop policy if exists "attorneys_manage_all_consults" on consults;
create policy "attorneys_manage_all_consults"
  on consults for all
  using (public.is_attorney());

-- ── consult_requests (source of truth) ──────────────────────────────────────
drop policy if exists "attorneys_all_consults" on consult_requests;
create policy "attorneys_all_consults"
  on consult_requests for all
  using (public.is_attorney());

-- ── usage_events ─────────────────────────────────────────────────────────────
drop policy if exists "attorneys_read_all_usage_events" on usage_events;
create policy "attorneys_read_all_usage_events"
  on usage_events for select
  using (public.is_attorney());

-- ── usage_period_totals ──────────────────────────────────────────────────────
drop policy if exists "attorneys_read_all_usage_period_totals" on usage_period_totals;
create policy "attorneys_read_all_usage_period_totals"
  on usage_period_totals for select
  using (public.is_attorney());

-- ── storage.objects (case-attachments bucket) ───────────────────────────────
drop policy if exists "attorneys_read_all_attachments_storage" on storage.objects;
create policy "attorneys_read_all_attachments_storage"
  on storage.objects for select
  using (
    bucket_id = 'case-attachments'
    and public.is_attorney()
  );
