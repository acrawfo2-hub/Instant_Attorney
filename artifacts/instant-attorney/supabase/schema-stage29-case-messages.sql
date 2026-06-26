-- Instant Attorney — Stage 29: direct attorney ⇆ client messaging
-- Run this in the Supabase SQL editor (production project).
--
-- Adds a person-to-person message channel scoped to a case file. This is
-- distinct from intake_messages (which is the client ⇆ AI intake transcript,
-- role 'user'/'assistant'). Here every row is written by a real person — the
-- client who owns the case or an attorney — so we carry both:
--   user_id   = the client who owns the case (drives the client RLS policy and
--               matches the intake_messages convention, avoiding a recursive
--               subquery against case_files)
--   sender_id = the profile that actually wrote the message
create table if not exists case_messages (
  id            uuid default gen_random_uuid() primary key,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  user_id       uuid references profiles(id) on delete cascade not null,
  sender_id     uuid references profiles(id) on delete set null,
  sender_role   text not null check (sender_role in ('attorney', 'client')),
  body          text not null,
  read_at       timestamptz,
  created_at    timestamptz default now() not null
);

create index if not exists case_messages_case_file_id_idx
  on case_messages (case_file_id, created_at);

alter table case_messages enable row level security;

-- ── Client: read/write messages on their own case ──────────────────────────
drop policy if exists "users_read_own_case_messages" on case_messages;
create policy "users_read_own_case_messages"
  on case_messages for select using (auth.uid() = user_id);

drop policy if exists "users_insert_own_case_messages" on case_messages;
create policy "users_insert_own_case_messages"
  on case_messages for insert with check (auth.uid() = user_id and sender_id = auth.uid());

drop policy if exists "users_update_own_case_messages" on case_messages;
create policy "users_update_own_case_messages"
  on case_messages for update using (auth.uid() = user_id);

-- ── Attorney: read/write on any case (reuses stage-11 SECURITY DEFINER helper,
--    which sidesteps RLS recursion) ─────────────────────────────────────────
drop policy if exists "attorneys_read_all_case_messages" on case_messages;
create policy "attorneys_read_all_case_messages"
  on case_messages for select using (public.is_attorney());

drop policy if exists "attorneys_insert_case_messages" on case_messages;
create policy "attorneys_insert_case_messages"
  on case_messages for insert with check (public.is_attorney() and sender_role = 'attorney');

drop policy if exists "attorneys_update_case_messages" on case_messages;
create policy "attorneys_update_case_messages"
  on case_messages for update using (public.is_attorney());
