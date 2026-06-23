-- Instant Attorney — Stage 21 Schema Additions
-- Run this AFTER schema-stage20-topup-spend-limits.sql in the Supabase SQL editor.
--
-- Tiered client-file retention (cold archival), replacing permanent deletion at
-- archive_at. When a matter reaches its archive date it is serialized, gzip-
-- compressed, AES-256-GCM encrypted, and stored as a single object in cold
-- storage; the hot rows are then purged. The file is RETAINED (not destroyed)
-- for the ethics retention period and can be retrieved on demand. See
-- legal/07-document-retention-and-destruction-policy.md.

-- Legal hold: when true, a matter (and its archive) is never archived or
-- destroyed automatically — e.g. a pending dispute, claim, or litigation hold.
alter table case_files
  add column if not exists legal_hold boolean not null default false;

-- One row per archived matter. This manifest is retained indefinitely (tiny)
-- and is the index that makes a cold archive locatable, auditable, and
-- retrievable years later. The source case_files row is purged after archival,
-- so case_file_id is recorded as a plain id (not a foreign key).
create table if not exists matter_archives (
  id                 uuid default gen_random_uuid() primary key,
  case_file_id       uuid not null,
  user_id            uuid references profiles(id) on delete set null,
  user_email         text,
  matter_title       text,
  matter_type        text,
  file_type          text,
  -- Cold-storage location of the encrypted bundle.
  storage_bucket     text not null,
  storage_path       text not null,
  -- Integrity: checksum of the stored (encrypted) object and of the
  -- pre-encryption gzip bundle. Verified on archival and on retrieval.
  sha256             text not null,
  plaintext_sha256   text not null,
  size_bytes         bigint not null,
  -- Encryption metadata (envelope/KMS upgrade keeps the same shape).
  enc_algo           text not null default 'aes-256-gcm',
  enc_key_version    text not null default 'v1',
  -- Contents summary for quick audit without decrypting.
  document_count     integer not null default 0,
  attachment_count   integer not null default 0,
  -- Retention controls.
  category           text,                 -- 'standard' | 'estate_planning' | 'minor' | ...
  legal_hold         boolean not null default false,
  archived_at        timestamptz not null default now(),
  retention_until    timestamptz,          -- null = indefinite (e.g. estate planning)
  destroyed_at       timestamptz,          -- set only when securely destroyed
  notes              text,
  created_at         timestamptz default now() not null
);

create index if not exists matter_archives_user_id_idx
  on matter_archives (user_id);
create index if not exists matter_archives_case_file_id_idx
  on matter_archives (case_file_id);
-- Find archives eligible for end-of-retention destruction.
create index if not exists matter_archives_retention_idx
  on matter_archives (retention_until)
  where destroyed_at is null;

-- Service-role only: archives contain confidential/privileged client data and
-- are accessed exclusively through attorney-gated server routes.
alter table matter_archives enable row level security;
-- No client policies are defined (service role bypasses RLS).
