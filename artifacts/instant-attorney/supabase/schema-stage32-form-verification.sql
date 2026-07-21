-- Instant Attorney — Stage 32 Schema Additions
-- Run this AFTER schema-stage31-case-messages.sql in the Supabase SQL editor.
--
-- Screenshot verification fallback for government forms: when a form isn't a
-- fillable PDF (or the client just prefers pen and paper), they fill it out by
-- hand and upload photos/screenshots of the completed pages. The AI compares
-- what it reads against the answers already collected in form_instruments and
-- reports back a per-field match. Images reuse the existing case-attachments
-- storage bucket/policies (schema-stage4.sql) under a form-verifications/ path.

create table if not exists form_verifications (
  id                 uuid default gen_random_uuid() primary key,
  form_instrument_id uuid references form_instruments(id) on delete cascade not null,
  case_file_id       uuid references case_files(id) on delete cascade not null,
  user_id            uuid references profiles(id) on delete cascade not null,
  -- Path layout: {userId}/{caseFileId}/form-verifications/{formInstrumentId}/{verificationId}-{n}-{fileName}
  storage_paths      text[] not null default '{}',
  status             text not null default 'processing'
    check (status in ('processing', 'verified', 'mismatch', 'needs_review', 'failed')),
  -- 1-3 sentence overview of whether the form looks correctly/completely filled.
  summary            text,
  -- Array of { field, label, expected, seen, match, note } — one entry per form field.
  field_results      jsonb not null default '[]',
  created_at         timestamptz default now() not null,
  updated_at         timestamptz default now() not null
);

create index if not exists form_verifications_instrument_idx
  on form_verifications (form_instrument_id, created_at desc);

alter table form_verifications enable row level security;

drop policy if exists "users_manage_own_form_verifications" on form_verifications;
create policy "users_manage_own_form_verifications"
  on form_verifications for all using (auth.uid() = user_id);

drop policy if exists "attorneys_read_all_form_verifications" on form_verifications;
create policy "attorneys_read_all_form_verifications"
  on form_verifications for select
  using (exists (select 1 from profiles where id = auth.uid() and is_attorney = true));
