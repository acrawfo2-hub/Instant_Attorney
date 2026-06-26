---
name: Instant-Attorney RLS recursion gotcha
description: Why attorney-gated reads broke, and the SECURITY DEFINER pattern that fixes it.
---

# Supabase RLS infinite recursion on `profiles`

An attorney-check RLS policy that lives **on the `profiles` table** and whose
`USING` clause sub-selects `profiles` (e.g. `exists (select 1 from profiles
where id = auth.uid() and is_attorney = true)`) makes Postgres throw
`42P17 "infinite recursion detected in policy for relation profiles"` on **every**
profile read under RLS (anon/authenticated SSR client). Service-role reads bypass
RLS so they look fine — masking the bug.

**Symptom seen:** attorney with `is_attorney=TRUE` hitting `/attorney` got bounced
to `/dashboard`, because the SSR anon-key `profiles` select returned null (errored)
so the `!profile?.is_attorney` gate fired.

**Fix (canonical Supabase pattern):** a `SECURITY DEFINER` function
`public.is_attorney()` (STABLE, `set search_path = public`) that reads profiles
with RLS bypassed, then every attorney policy uses `using (public.is_attorney())`.
See `artifacts/instant-attorney/supabase/schema-stage11-fix-rls-recursion.sql`.

**Why:** a policy that queries its own table re-triggers itself; only a
DEFINER function (owner has BYPASSRLS) breaks the cycle.

**How to apply:** never reference table T inside an RLS policy that is itself ON
table T. Route the check through a SECURITY DEFINER helper. The same subquery is
safe in policies on *other* tables once the `profiles` policy is non-recursive,
but converting all of them to the function is cleaner and avoids the trap entirely.

**Note:** migrations here are not applied by the agent — user runs the SQL in the
Supabase SQL editor (no direct DATABASE_URL; only REST + service-role available).
