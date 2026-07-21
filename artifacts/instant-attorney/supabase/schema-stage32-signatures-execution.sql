-- Stage 32: Signature / execution audit trail
-- Run after schema-stage31-case-messages.sql
--
-- 1) Harden representation_agreements + ai_consents with evidentiary columns
-- 2) document_executions — matter-doc quick-sign + Dropbox Sign tracking

-- ── Platform agreement audit fields ─────────────────────────────────────────
alter table representation_agreements
  add column if not exists content_sha256 text,
  add column if not exists signer_ip text,
  add column if not exists signer_user_agent text,
  add column if not exists receipt_storage_path text;

alter table ai_consents
  add column if not exists content_sha256 text,
  add column if not exists signer_ip text,
  add column if not exists signer_user_agent text,
  add column if not exists signature_name text;

-- ── Matter document executions ──────────────────────────────────────────────
create table if not exists document_executions (
  id                      uuid default gen_random_uuid() primary key,
  document_id             uuid references documents(id) on delete cascade not null,
  case_file_id            uuid references case_files(id) on delete cascade not null,
  user_id                 uuid references profiles(id) on delete cascade not null,
  -- esign | print_formalities | send_only | court_signature | dropbox_sign
  execution_mode          text not null,
  status                  text not null default 'pending'
                          check (status in (
                            'pending',
                            'signed',
                            'sent_for_signature',
                            'completed',
                            'declined',
                            'voided'
                          )),
  signature_name          text,
  content_sha256          text,
  signer_ip               text,
  signer_user_agent       text,
  -- Dropbox Sign (HelloSign) ids when that path is used
  dropbox_signature_request_id text,
  provider                text, -- 'in_app' | 'dropbox_sign' | null (print path)
  metadata                jsonb not null default '{}'::jsonb,
  signed_at               timestamptz,
  created_at              timestamptz default now() not null,
  updated_at              timestamptz default now() not null
);

create index if not exists document_executions_document_id_idx
  on document_executions (document_id);
create index if not exists document_executions_user_id_idx
  on document_executions (user_id);
create index if not exists document_executions_dropbox_id_idx
  on document_executions (dropbox_signature_request_id)
  where dropbox_signature_request_id is not null;

alter table document_executions enable row level security;

-- Clients read their own execution rows; attorneys read all (via is_attorney).
create policy "users_read_own_document_executions"
  on document_executions for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_attorney = true
    )
  );

-- NO client insert/update/delete — written exclusively by service-role API routes
-- (same pattern as document_deliveries).
