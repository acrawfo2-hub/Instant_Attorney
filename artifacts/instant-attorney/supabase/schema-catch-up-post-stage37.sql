-- Instant Attorney — Catch-up migration (post stage 37)
-- Paste this ENTIRE file into Supabase → SQL Editor → Run AFTER
-- schema-catch-up-to-stage37.sql (or equivalent stages 29–37).
-- Idempotent: safe to re-run.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 38 — signatures / document execution audit trail
-- ═══════════════════════════════════════════════════════════════════════════
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

create table if not exists document_executions (
  id                      uuid default gen_random_uuid() primary key,
  document_id             uuid references documents(id) on delete cascade not null,
  case_file_id            uuid references case_files(id) on delete cascade not null,
  user_id                 uuid references profiles(id) on delete cascade not null,
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
  dropbox_signature_request_id text,
  provider                text,
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

drop policy if exists "users_read_own_document_executions" on document_executions;
create policy "users_read_own_document_executions"
  on document_executions for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.is_attorney = true
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 39 — form screenshot verification
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists form_verifications (
  id                 uuid default gen_random_uuid() primary key,
  form_instrument_id uuid references form_instruments(id) on delete cascade not null,
  case_file_id       uuid references case_files(id) on delete cascade not null,
  user_id            uuid references profiles(id) on delete cascade not null,
  storage_paths      text[] not null default '{}',
  status             text not null default 'processing'
    check (status in ('processing', 'verified', 'mismatch', 'needs_review', 'failed')),
  summary            text,
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 40 — freestyle chat mode + attorney workspace
-- ═══════════════════════════════════════════════════════════════════════════
alter table case_files
  add column if not exists chat_mode text not null default 'intake'
  check (chat_mode in ('intake', 'freestyle'));

create table if not exists attorney_workspace_messages (
  id            uuid default gen_random_uuid() primary key,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  attorney_id   uuid references profiles(id) on delete cascade not null,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  created_at    timestamptz default now() not null
);

create index if not exists attorney_workspace_messages_scope_idx
  on attorney_workspace_messages (case_file_id, attorney_id, created_at);

alter table attorney_workspace_messages enable row level security;

drop policy if exists "attorneys_read_own_workspace" on attorney_workspace_messages;
create policy "attorneys_read_own_workspace"
  on attorney_workspace_messages for select
  using (public.is_attorney() and attorney_id = auth.uid());

drop policy if exists "attorneys_insert_own_workspace" on attorney_workspace_messages;
create policy "attorneys_insert_own_workspace"
  on attorney_workspace_messages for insert
  with check (public.is_attorney() and attorney_id = auth.uid());

drop policy if exists "attorneys_delete_own_workspace" on attorney_workspace_messages;
create policy "attorneys_delete_own_workspace"
  on attorney_workspace_messages for delete
  using (public.is_attorney() and attorney_id = auth.uid());

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 41 — living file background sync watermark
-- ═══════════════════════════════════════════════════════════════════════════
alter table case_files
  add column if not exists last_file_synced_at timestamptz;
