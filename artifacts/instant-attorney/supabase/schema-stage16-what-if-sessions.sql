-- ── What-If Game session store ─────────────────────────────────────────────
-- The What-If Game is a standalone, optional strategy tool. It reads the Living
-- File for context but is deliberately decoupled from the document wizards: it
-- NEVER writes legal_strategy. Its own output (the generated scenarios and the
-- user's answers) lives here, in its own table, kept clear of the wizard-driving
-- fields on case_files.
--
-- The only thing the game writes into shared, wizard-visible data is fact_items
-- (handled by the app, not this migration).
--
-- case_file_id is NULLABLE on purpose: the game also runs standalone, on a
-- free-text scenario with no file attached.
--
-- IMPORTANT (deploy): the live database must actually run this SQL. Until it is
-- applied, inserts/updates here fail with PGRST205 and are swallowed by the app
-- (session history is skipped) — the game itself still works because answers are
-- saved as fact_items in the already-existing fact_items table. Idempotent —
-- safe to re-run.

create table if not exists what_if_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_file_id uuid references case_files(id) on delete cascade,
  scenario_input text,
  scenarios jsonb not null default '[]'::jsonb,
  answers jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists what_if_sessions_user_idx
  on what_if_sessions (user_id);

create index if not exists what_if_sessions_case_idx
  on what_if_sessions (case_file_id)
  where case_file_id is not null;

alter table what_if_sessions enable row level security;

-- A user owns their own sessions. We gate only on user_id (no cross-table
-- subquery): case_file_id is nullable, and the app already verifies case
-- ownership before writing any fact_items, so there is nothing for a tighter
-- policy to protect here — and gating only on auth.uid() keeps it recursion-safe.
drop policy if exists "users_manage_own_what_if_sessions" on what_if_sessions;
create policy "users_manage_own_what_if_sessions"
  on what_if_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
