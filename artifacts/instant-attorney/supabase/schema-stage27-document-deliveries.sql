-- Instant Attorney — Stage 27 Schema Additions
-- Run this AFTER schema-stage26-consult-wrap-up.sql in the Supabase SQL editor.
--
-- Document delivery audit trail + snapshot record.
--
-- AI Philosophy §4.2 and Terms of Service §7 promise that pre-review drafts are
-- watermarked until a licensed attorney approves them. To stand behind that in a
-- dispute, the Firm needs an answer to: "what exactly did we deliver to the
-- client, in what review state, and when?" The rendered .docx is built on the fly
-- at download time and was never persisted, and downloads were never logged — so
-- there was no byte-for-byte record and no access trail.
--
-- This table closes both gaps. One row is written on every successful document
-- download:
--   * the review status and watermark state at the moment of delivery,
--   * who downloaded it and whether they were an attorney,
--   * a SHA-256 of the exact bytes delivered (tamper-evident), and
--   * a pointer to the archived .docx in private storage (bucket
--     `document-deliveries`, object key `{document_id}/{sha256}.docx`), so each
--     distinct rendered version is retained byte-for-byte, de-duplicated by hash.
--
-- Writes are SERVICE-ROLE ONLY (no client insert/update/delete policy), so the
-- audit trail cannot be forged or rewritten through a user JWT — the same posture
-- as financial_secure_ref and stripe_webhook_events.
--
-- Idempotent — safe to re-run.

create table if not exists document_deliveries (
  id                       uuid default gen_random_uuid() primary key,
  document_id              uuid references documents(id) on delete cascade not null,
  case_file_id             uuid references case_files(id) on delete cascade not null,
  -- The document owner (client). Kept even if downloaded_by is an attorney.
  user_id                  uuid references profiles(id) on delete set null,
  -- Who actually performed the download (client or attorney).
  downloaded_by            uuid references profiles(id) on delete set null,
  downloaded_by_is_attorney boolean not null default false,
  -- documents.status at the moment of delivery (draft / pending_review /
  -- changes_requested / approved / delivered / …). Stored as text so the audit
  -- row survives even if the status vocabulary later changes.
  document_status          text,
  -- True when this delivery carried the pre-review watermark (i.e. NOT approved).
  watermarked              boolean not null,
  -- SHA-256 (hex) of the exact .docx bytes delivered. Tamper-evident fingerprint.
  content_sha256           text not null,
  byte_size                integer,
  -- Where the byte-for-byte copy is archived (null if the upload could not be
  -- completed — the hash row is still written so the trail has no silent gaps).
  storage_bucket           text,
  storage_path             text,
  created_at               timestamptz default now() not null
);

create index if not exists document_deliveries_document_idx on document_deliveries (document_id);
create index if not exists document_deliveries_case_file_idx on document_deliveries (case_file_id);
create index if not exists document_deliveries_sha_idx on document_deliveries (content_sha256);

alter table document_deliveries enable row level security;

-- Clients may read their own delivery history (transparency), but never write it.
drop policy if exists "users_read_own_document_deliveries" on document_deliveries;
create policy "users_read_own_document_deliveries"
  on document_deliveries for select using (auth.uid() = user_id);

-- Attorneys may read the full trail.
drop policy if exists "attorneys_read_all_document_deliveries" on document_deliveries;
create policy "attorneys_read_all_document_deliveries"
  on document_deliveries for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );

-- NO insert/update/delete policy, by design: the trail is written exclusively by
-- service-role server code (lib/document-delivery.ts) so it cannot be forged or
-- rewritten through a user session.
