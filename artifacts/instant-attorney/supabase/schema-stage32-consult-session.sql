-- Instant Attorney — Stage 32: Consult live session (notepad + recording)
-- Run AFTER schema-stage31-case-messages.sql in the Supabase SQL editor
--
-- Backs the live consult session, viewable in "attorney as client" mode
-- (the attorney working the call) and "attorney as reviewer" mode (a
-- supervising attorney auditing after the fact) — both are just is_attorney()
-- profiles, so there is no separate reviewer role at the DB layer; the
-- distinction is made in the app.
--
-- Two pieces:
--   * consult_notes      — timestamped notepad entries kept during the call.
--   * consult_recordings — one row per uploaded audio recording, transcribed
--                          after the call (not live). Modeled on
--                          document_deliveries: an evidentiary trail, so
--                          inserts are SERVICE-ROLE ONLY and cannot be forged
--                          from a user session. Attorneys may correct
--                          transcript_text after automated transcription.
--
-- Neither table is client-readable: like attorney_notes on consult_requests,
-- notepad entries and raw recordings/transcripts are attorney work product.
-- Clients see only the finished wrap_up / post_consult_plan closeout.
--
-- Idempotent — safe to re-run.

alter table consult_requests
  add column if not exists session_started_at timestamptz,
  add column if not exists session_ended_at timestamptz,
  add column if not exists recording_consent_at timestamptz;

-- ── Notepad ──────────────────────────────────────────────────────────────
create table if not exists consult_notes (
  id                 uuid default gen_random_uuid() primary key,
  consult_request_id uuid references consult_requests(id) on delete cascade not null,
  author_id          uuid references profiles(id) on delete set null,
  body               text not null,
  created_at         timestamptz default now() not null,
  updated_at         timestamptz default now() not null
);

create index if not exists consult_notes_consult_request_idx
  on consult_notes (consult_request_id, created_at);

alter table consult_notes enable row level security;

drop policy if exists "attorneys_manage_consult_notes" on consult_notes;
create policy "attorneys_manage_consult_notes"
  on consult_notes for all using (public.is_attorney());

-- ── Recordings + transcripts ─────────────────────────────────────────────
create table if not exists consult_recordings (
  id                 uuid default gen_random_uuid() primary key,
  consult_request_id uuid references consult_requests(id) on delete cascade not null,
  recorded_by        uuid references profiles(id) on delete set null,
  storage_bucket     text,
  storage_path       text,
  content_sha256     text,
  duration_seconds   integer,
  byte_size          integer,
  transcript_status  text not null default 'pending'
                     check (transcript_status in ('pending','processing','ready','failed')),
  transcript_text    text,
  transcript_error   text,
  recorded_at        timestamptz default now() not null,
  transcribed_at     timestamptz
);

create index if not exists consult_recordings_consult_request_idx
  on consult_recordings (consult_request_id, recorded_at);

alter table consult_recordings enable row level security;

-- Attorneys may read and correct transcripts. No insert/delete policy, by
-- design: rows are written exclusively by service-role server code (mirrors
-- document_deliveries) so the recording/transcript trail cannot be forged
-- or rewritten through a user JWT.
drop policy if exists "attorneys_read_consult_recordings" on consult_recordings;
create policy "attorneys_read_consult_recordings"
  on consult_recordings for select using (public.is_attorney());

drop policy if exists "attorneys_update_consult_recordings" on consult_recordings;
create policy "attorneys_update_consult_recordings"
  on consult_recordings for update using (public.is_attorney());
