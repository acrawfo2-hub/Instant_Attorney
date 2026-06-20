-- ── Tighten fact_items RLS to enforce case ownership ────────────────────────
-- The original policy (schema.sql) gated fact_items only on user_id:
--
--   create policy "users_manage_own_fact_items"
--     on fact_items for all using (auth.uid() = user_id);
--
-- Because it has no WITH CHECK clause and never inspects case_file_id, a user
-- authenticated with their own Supabase JWT could call PostgREST directly
-- (bypassing the Next.js app and its app-level ownership checks) and INSERT a
-- fact_item carrying their own user_id but a VICTIM's case_file_id. That row
-- would then be pulled into the victim's case context by the app's service-
-- client reads, which filter by case_file_id only and bypass RLS — a fact /
-- prompt-poisoning vector.
--
-- This migration replaces the policy with one that additionally requires the
-- caller to own the referenced case_file, on both read (USING) and write
-- (WITH CHECK). The EXISTS subquery is evaluated under the caller's own RLS, so
-- it can only see case_files the caller owns; an attacker cannot satisfy it for
-- someone else's case.
--
-- Behavior impact on the application: NONE. All app writes to fact_items go
-- through the service-role client, which bypasses RLS entirely. This policy only
-- constrains direct, user-JWT access to PostgREST.
--
-- Recursion safety: case_files policies (schema.sql / stage11) gate only on
-- auth.uid() = user_id and public.is_attorney(); none reference fact_items, so
-- this cross-table EXISTS cannot recurse. Idempotent — safe to re-run.

drop policy if exists "users_manage_own_fact_items" on fact_items;

create policy "users_manage_own_fact_items"
  on fact_items for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from case_files cf
      where cf.id = fact_items.case_file_id
        and cf.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from case_files cf
      where cf.id = fact_items.case_file_id
        and cf.user_id = auth.uid()
    )
  );

-- Verification — after applying, confirm exactly one policy named
-- "users_manage_own_fact_items" exists on fact_items with a non-null WITH CHECK:
--   select polname, qual is not null as has_using, with_check is not null as has_check
--     from pg_policies join pg_policy on pg_policy.polname = pg_policies.policyname
--    where pg_policies.tablename = 'fact_items';
