-- Instant Attorney — Stage 33: security hardening (profile self-elevation +
-- concurrent-write races surfaced by a QA pass on the attorney-user/chat-edit work)
-- Run AFTER schema-stage32-attorney-user-mode.sql in the Supabase SQL editor
--
-- Security fix. "users_update_own_profile" (schema.sql) is a plain
-- `for update using (auth.uid() = id)` policy with no column restriction.
-- Postgres RLS policies are row-scoped, not column-scoped, so — combined
-- with Supabase's default broad table-level UPDATE grant to `authenticated`
-- — any signed-in client can update ANY column on their own profiles row
-- directly via the Supabase client SDK, bypassing every app-layer check:
--   supabase.from('profiles').update({ account_type: 'attorney_user',
--     attorney_user_status: 'approved' }).eq('id', myId)
-- self-elevates straight past the manual bar-number approval queue this
-- app builds (app/admin/attorney-signups), and
--   supabase.from('profiles').update({ is_attorney: true }).eq('id', myId)
-- is worse: public.is_attorney() (schema-stage11-fix-rls-recursion.sql)
-- then grants that account global cross-tenant read/write access to every
-- other client's documents and case files.
--
-- Fix: column-level privileges. RLS still governs WHICH ROWS a client can
-- touch; this additionally governs WHICH COLUMNS. The app's only
-- client-facing profile write path (app/api/account/profile/route.ts) only
-- ever sets full_name/phone/bar_number/firm_name — those stay writable by
-- `authenticated`. email/is_attorney/account_type/attorney_user_status are
-- only ever written by the service role (the signup trigger, the admin
-- attorney-signups decide route, or manual SQL) and now require it.

revoke update on table profiles from authenticated;
grant update (full_name, phone, bar_number, firm_name) on profiles to authenticated;

-- ── Prevent duplicate child documents under concurrent requests ────────────
-- A document can have at most one critical_review child and one second_draft
-- child. Concurrent chat-edit / second-draft-generation calls previously had
-- no DB-level guard against both racing to insert a fresh child at once
-- (each read "no existing child" and both inserted), silently orphaning one.
-- The route now catches the resulting unique-violation and asks the caller
-- to retry instead of creating a duplicate.
create unique index if not exists documents_parent_doctype_unique
  on documents (parent_document_id, doc_type)
  where parent_document_id is not null;
