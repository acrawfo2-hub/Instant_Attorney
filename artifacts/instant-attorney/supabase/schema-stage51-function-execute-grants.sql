-- Stage 51: stop exposing SECURITY DEFINER functions over the public REST API.
--
-- Found by Supabase's database linter (`get_advisors --type security`) after the
-- stage 44–50 apply. Nothing in this repository had ever run it.
--
-- Postgres grants EXECUTE on a new function to PUBLIC by default, and Supabase
-- exposes everything in the `public` schema at /rest/v1/rpc/<name>. Together
-- that means every helper function here was callable by anyone who could reach
-- the API — including the `anon` role, which needs no login.
--
-- A SECURITY DEFINER function bypasses RLS by design. The sharp one was
-- `apply_document_placeholder_revision(document_id, expected_revision, text,
-- actor)`: it writes `documents.draft_text`, so an unauthenticated caller
-- holding a document UUID could rewrite a legal document, and a signed-in one
-- could rewrite anybody's. Its only caller is
-- `app/api/documents/[id]/fill-info`, which uses the service-role client and
-- checks ownership itself before calling.
--
-- Note the trap: `revoke execute ... from anon` does NOTHING while PUBLIC still
-- holds the grant — anon keeps the privilege through PUBLIC, and
-- `has_function_privilege('anon', …)` still returns true. Revoke from PUBLIC,
-- then grant back to the roles that actually call the function.
--
-- Trigger functions are included. A trigger fires as the table owner and never
-- consults EXECUTE grants, so revoking costs nothing and closes the RPC surface.

revoke execute on function public.apply_document_placeholder_revision(uuid, integer, text, uuid) from public;
revoke execute on function public.apply_document_placeholder_revision(uuid, integer, text, uuid) from authenticated;
grant  execute on function public.apply_document_placeholder_revision(uuid, integer, text, uuid) to service_role;

revoke execute on function public.acquire_living_file_sync(uuid, uuid, integer) from public;
revoke execute on function public.advance_living_file_cursor(uuid, uuid, timestamptz, uuid, timestamptz, uuid) from public;
revoke execute on function public.release_living_file_sync(uuid, uuid) from public;
grant  execute on function public.acquire_living_file_sync(uuid, uuid, integer) to service_role, authenticated;
grant  execute on function public.advance_living_file_cursor(uuid, uuid, timestamptz, uuid, timestamptz, uuid) to service_role, authenticated;
grant  execute on function public.release_living_file_sync(uuid, uuid) to service_role, authenticated;

revoke execute on function public.enqueue_document_refresh(uuid, text[], text[], integer) from public;
grant  execute on function public.enqueue_document_refresh(uuid, text[], text[], integer) to service_role;

-- Trigger functions — no legitimate direct caller at all.
revoke execute on function public.checkpoint_final_document_status() from public;
revoke execute on function public.enforce_document_generation_active_limit() from public;
revoke execute on function public.handle_new_user() from public;

-- SECURITY INVOKER: runs with the caller's rights and RLS still applies, so this
-- is tidying rather than a hole. Signed-in clients open chat turns with it.
revoke execute on function public.create_chat_acp_job(uuid, uuid, uuid) from public;
grant  execute on function public.create_chat_acp_job(uuid, uuid, uuid) to service_role, authenticated;

-- is_attorney() is referenced inside RLS policies, which evaluate as the
-- invoking role — `authenticated` must keep EXECUTE or every attorney policy
-- fails closed.
revoke execute on function public.is_attorney() from public;
grant  execute on function public.is_attorney() to service_role, authenticated;

-- Verify:
--   select p.proname,
--          has_function_privilege('anon', p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as auth
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public';
