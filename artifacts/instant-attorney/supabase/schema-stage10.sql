-- Instant Attorney — Stage 10 Schema Additions
-- Run this AFTER schema-stage9.sql in the Supabase SQL editor.
--
-- Government form instruments: government forms detected in chat that a client
-- needs to complete. Surfaced as "legal instruments to complete" and guided by
-- the gov-form tool (lib/government-forms.ts), separate from wizard documents.

create table if not exists form_instruments (
  id            uuid default gen_random_uuid() primary key,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  user_id       uuid references profiles(id) on delete cascade not null,
  form_key      text not null,
  status        text not null default 'needed'
    check (status in ('needed', 'in_progress', 'completed', 'dismissed')),
  reason        text,
  answers       jsonb not null default '{}',
  -- 'registry': a curated, source-verified form (definition lives in
  --   lib/government-forms.ts, trusted). 'dynamic': a form detected in chat that
  --   wasn't seeded; its definition is looked up from the official .gov page and
  --   stored in form_def, always shown to the client as "unverified — confirm
  --   against the official source".
  source        text not null default 'registry'
    check (source in ('registry', 'dynamic')),
  -- For dynamic forms: the grounded form definition (fields, deadline, official
  -- URL, etc.). Null for registry forms (read from the static registry instead).
  form_def      jsonb,
  -- Dynamic-form lookup lifecycle: pending → ready (grounded def available) or
  -- failed (degrade to link-only guidance). Null for registry forms.
  lookup_status text
    check (lookup_status is null or lookup_status in ('pending', 'ready', 'failed')),
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

-- One instrument per form per case file (detection re-runs each turn; upserts
-- must not create duplicates).
create unique index if not exists form_instruments_case_form_unique
  on form_instruments (case_file_id, form_key);

create index if not exists form_instruments_case_file_idx
  on form_instruments (case_file_id);

alter table form_instruments enable row level security;

create policy "users_manage_own_form_instruments"
  on form_instruments for all using (auth.uid() = user_id);
