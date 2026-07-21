-- Instant Attorney — Catch-up migration (stages 8, 13–37)
-- Paste this ENTIRE file into Supabase → SQL Editor → Run.
-- Idempotent: safe to re-run even if some stages were already applied.
--
-- WHEN TO USE THIS:
--   • You have an existing Supabase project that ran early migrations but is
--     behind the current app (stages 8+).
--   • For a BRAND-NEW empty project, run schema.sql then schema-stage2.sql
--     through schema-stage7.sql first, THEN run this file.
--
-- BEFORE running: paste schema-verify.sql and note which rows show MISSING.
-- AFTER running: paste schema-verify.sql again; every row should be OK.

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 8 — derived documents
-- ═══════════════════════════════════════════════════════════════════════════
alter table documents
  add column if not exists parent_document_id uuid references documents(id) on delete cascade,
  add column if not exists attorney_second_draft_prompt text;

create index if not exists documents_parent_document_id_idx
  on documents (parent_document_id)
  where parent_document_id is not null;

-- Ensure user document write policies exist (fixes silent persistence failures)
drop policy if exists "users_insert_own_documents" on documents;
create policy "users_insert_own_documents"
  on documents for insert with check (auth.uid() = user_id);

drop policy if exists "users_update_own_documents" on documents;
create policy "users_update_own_documents"
  on documents for update
  using (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 13 — retire pre_warmed document status
-- ═══════════════════════════════════════════════════════════════════════════
update documents
  set status = 'draft',
      updated_at = now()
  where status = 'pre_warmed'
    and draft_text is not null
    and length(trim(draft_text)) > 0;

delete from documents
  where status = 'pre_warmed'
    and (draft_text is null or length(trim(draft_text)) = 0);

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 14 — tighten fact_items RLS
-- ═══════════════════════════════════════════════════════════════════════════
drop policy if exists "users_manage_own_fact_items" on fact_items;

create policy "users_manage_own_fact_items"
  on fact_items for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from case_files cf
      where cf.id = fact_items.case_file_id
        and cf.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from case_files cf
      where cf.id = fact_items.case_file_id
        and cf.user_id = auth.uid()
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 15 — link attachments to chat messages
-- ═══════════════════════════════════════════════════════════════════════════
alter table attachments
  add column if not exists message_id uuid references intake_messages(id) on delete cascade;

create index if not exists attachments_message_id_idx
  on attachments (message_id)
  where message_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 16 — what-if sessions
-- ═══════════════════════════════════════════════════════════════════════════
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

drop policy if exists "users_manage_own_what_if_sessions" on what_if_sessions;
create policy "users_manage_own_what_if_sessions"
  on what_if_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 17 — fact_items.kind
-- ═══════════════════════════════════════════════════════════════════════════
alter table fact_items
  add column if not exists kind text not null default 'fact';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fact_items_kind_check'
  ) then
    alter table fact_items
      add constraint fact_items_kind_check check (kind in ('fact', 'hypothetical'));
  end if;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 18 — documents.facts_synced_at
-- ═══════════════════════════════════════════════════════════════════════════
alter table documents
  add column if not exists facts_synced_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 19 — token top-ups + billing
-- ═══════════════════════════════════════════════════════════════════════════
alter table profiles
  add column if not exists billing_exempt boolean not null default false;

update profiles set billing_exempt = true
  where email = 'vicky.crawford12@gmail.com';

create table if not exists top_up_ledger (
  user_id                uuid primary key references profiles(id) on delete cascade,
  meter_usd              numeric(12, 6) not null default 0,
  status                 text not null default 'ok'
    check (status in ('ok', 'pending', 'blocked')),
  cycle_id               uuid not null default gen_random_uuid(),
  allowance_used_usd     numeric(12, 6) not null default 0,
  allowance_period_start timestamptz not null default date_trunc('month', now()),
  total_topups           integer not null default 0,
  total_topup_usd        numeric(12, 2) not null default 0,
  updated_at             timestamptz default now() not null
);

alter table top_up_ledger enable row level security;

drop policy if exists "users_read_own_top_up_ledger" on top_up_ledger;
create policy "users_read_own_top_up_ledger"
  on top_up_ledger for select using (auth.uid() = user_id);

drop policy if exists "attorneys_read_all_top_up_ledger" on top_up_ledger;
create policy "attorneys_read_all_top_up_ledger"
  on top_up_ledger for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );

create table if not exists top_up_charges (
  id                       uuid default gen_random_uuid() primary key,
  user_id                  uuid references profiles(id) on delete cascade not null,
  cycle_id                 uuid not null,
  stripe_payment_intent_id text,
  amount_usd               numeric(12, 2) not null,
  cogs_at_trigger_usd      numeric(12, 6) not null default 0,
  status                   text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'skipped')),
  failure_reason           text,
  created_at               timestamptz default now() not null,
  settled_at               timestamptz
);

create unique index if not exists top_up_charges_user_cycle_unique
  on top_up_charges (user_id, cycle_id);

create index if not exists top_up_charges_payment_intent_idx
  on top_up_charges (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table top_up_charges enable row level security;

drop policy if exists "users_read_own_top_up_charges" on top_up_charges;
create policy "users_read_own_top_up_charges"
  on top_up_charges for select using (auth.uid() = user_id);

drop policy if exists "attorneys_read_all_top_up_charges" on top_up_charges;
create policy "attorneys_read_all_top_up_charges"
  on top_up_charges for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );

create table if not exists stripe_webhook_events (
  event_id    text primary key,
  event_type  text not null,
  received_at timestamptz default now() not null
);

alter table stripe_webhook_events enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 20 — top-up spend limits
-- ═══════════════════════════════════════════════════════════════════════════
alter table top_up_ledger
  add column if not exists monthly_topup_limit_usd numeric(12, 2),
  add column if not exists month_topup_usd          numeric(12, 2) not null default 0,
  add column if not exists block_reason             text
    check (block_reason in ('limit_reached', 'topup_failed'));

update top_up_ledger
  set monthly_topup_limit_usd = 25.00
  where monthly_topup_limit_usd is null;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 21 (completion grace)
-- ═══════════════════════════════════════════════════════════════════════════
alter table top_up_ledger
  add column if not exists grace_opt_in     boolean       not null default false,
  add column if not exists grace_buffer_usd numeric(12, 6),
  add column if not exists grace_anchor_usd numeric(12, 6);

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 21 (matter archival)
-- ═══════════════════════════════════════════════════════════════════════════
alter table case_files
  add column if not exists legal_hold boolean not null default false;

create table if not exists matter_archives (
  id                 uuid default gen_random_uuid() primary key,
  case_file_id       uuid not null,
  user_id            uuid references profiles(id) on delete set null,
  user_email         text,
  matter_title       text,
  matter_type        text,
  file_type          text,
  storage_bucket     text not null,
  storage_path       text not null,
  sha256             text not null,
  plaintext_sha256   text not null,
  size_bytes         bigint not null,
  enc_algo           text not null default 'aes-256-gcm',
  enc_key_version    text not null default 'v1',
  document_count     integer not null default 0,
  attachment_count   integer not null default 0,
  category           text,
  legal_hold         boolean not null default false,
  archived_at        timestamptz not null default now(),
  retention_until    timestamptz,
  destroyed_at       timestamptz,
  notes              text,
  created_at         timestamptz default now() not null
);

create index if not exists matter_archives_user_id_idx
  on matter_archives (user_id);
create index if not exists matter_archives_case_file_id_idx
  on matter_archives (case_file_id);
create index if not exists matter_archives_retention_idx
  on matter_archives (retention_until)
  where destroyed_at is null;

alter table matter_archives enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 22 — archive destruction notice
-- ═══════════════════════════════════════════════════════════════════════════
alter table matter_archives
  add column if not exists destruction_notice_sent_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 23 — financial picture
-- ═══════════════════════════════════════════════════════════════════════════
alter table case_files
  add column if not exists representation_scope text not null default 'single_client'
    check (representation_scope in ('single_client', 'joint_spouses')),
  add column if not exists partner_role text not null default 'none'
    check (partner_role in ('none', 'adverse_party', 'joint_client', 'non_client_third_party')),
  add column if not exists partner_consented boolean not null default false,
  add column if not exists joint_no_secrets_ack boolean not null default false,
  add column if not exists financial_disclosure_acked_at timestamptz,
  add column if not exists financial_disclosure_version text;

create table if not exists financial_items (
  id                     uuid default gen_random_uuid() primary key,
  case_file_id           uuid references case_files(id) on delete cascade not null,
  user_id                uuid references profiles(id) on delete cascade not null,
  category               text not null
    check (category in (
      'real_property', 'vehicle', 'financial_account', 'retirement_account',
      'business_interest', 'personal_property', 'life_insurance', 'receivable',
      'secured_debt', 'unsecured_debt', 'income_source', 'recurring_expense'
    )),
  label                  text not null,
  acquisition_note       text,
  owner                  text not null default 'client'
    check (owner in ('client', 'partner', 'joint', 'other_third_party')),
  characterization       text not null default 'mixed_or_unknown'
    check (characterization in (
      'community', 'separate_client', 'separate_partner', 'mixed_or_unknown', 'not_applicable'
    )),
  exempt_status          text not null default 'unknown'
    check (exempt_status in ('exempt', 'non_exempt', 'partial', 'unknown', 'not_applicable')),
  value_low              numeric(14, 2),
  value_high             numeric(14, 2),
  value_basis            text not null default 'client_estimate'
    check (value_basis in (
      'client_estimate', 'account_statement', 'appraisal', 'tax_assessment',
      'contract_or_title', 'other_document'
    )),
  valued_as_of           date,
  provenance             text not null default 'client_asserted'
    check (provenance in ('client_asserted', 'document_extracted', 'attorney_verified')),
  verification_status    text not null default 'unverified'
    check (verification_status in ('unverified', 'doc_supported', 'attorney_verified')),
  source_attachment_id   uuid references attachments(id) on delete set null,
  phase_collected        text not null default 'phase_2_privileged'
    check (phase_collected in ('phase_1_unprivileged', 'phase_2_privileged')),
  privileged             boolean not null default true,
  red_flags              jsonb not null default '[]'::jsonb,
  needs_attorney_review  boolean not null default false,
  status                 text not null default 'active'
    check (status in ('active', 'superseded', 'removed')),
  superseded_by          uuid,
  created_at             timestamptz default now() not null,
  updated_at             timestamptz default now() not null
);

create index if not exists financial_items_case_idx on financial_items (case_file_id);

alter table financial_items enable row level security;

drop policy if exists "users_manage_own_financial_items" on financial_items;
create policy "users_manage_own_financial_items"
  on financial_items for all
  using (
    auth.uid() = user_id
    and exists (
      select 1 from case_files cf
      where cf.id = financial_items.case_file_id and cf.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from case_files cf
      where cf.id = financial_items.case_file_id and cf.user_id = auth.uid()
    )
  );

drop policy if exists "attorneys_read_all_financial_items" on financial_items;
create policy "attorneys_read_all_financial_items"
  on financial_items for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 24 — encrypted identifier vault
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists financial_secure_ref (
  id                  uuid default gen_random_uuid() primary key,
  financial_item_id   uuid references financial_items(id) on delete cascade not null,
  user_id             uuid references profiles(id) on delete cascade not null,
  kind                text not null
    check (kind in ('ssn', 'account_number', 'routing_number', 'policy_number', 'other')),
  ciphertext          text not null,
  last4               text,
  key_version         text not null default 'v1',
  created_at          timestamptz default now() not null,
  updated_at          timestamptz default now() not null
);

create index if not exists financial_secure_ref_item_idx on financial_secure_ref (financial_item_id);

alter table financial_secure_ref enable row level security;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 25 — roadmap AI overlay cache
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists roadmap_snapshots (
  id                  uuid default gen_random_uuid() primary key,
  case_file_id        uuid references case_files(id) on delete cascade not null,
  user_id             uuid references profiles(id) on delete cascade not null,
  file_fingerprint    text not null,
  blueprint_key       text not null,
  blueprint_version   text not null default '1',
  ai_overlay          jsonb not null default '{}'::jsonb,
  generated_at        timestamptz default now() not null,
  updated_at          timestamptz default now() not null,
  unique (case_file_id)
);

create index if not exists roadmap_snapshots_user_idx on roadmap_snapshots (user_id);

alter table roadmap_snapshots enable row level security;

drop policy if exists "users_read_own_roadmap_snapshots" on roadmap_snapshots;
create policy "users_read_own_roadmap_snapshots"
  on roadmap_snapshots for select using (auth.uid() = user_id);

drop policy if exists "users_upsert_own_roadmap_snapshots" on roadmap_snapshots;
create policy "users_upsert_own_roadmap_snapshots"
  on roadmap_snapshots for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "attorneys_read_all_roadmap_snapshots" on roadmap_snapshots;
create policy "attorneys_read_all_roadmap_snapshots"
  on roadmap_snapshots for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 26 — consult wrap-up (Phase B)
-- ═══════════════════════════════════════════════════════════════════════════
alter table consult_requests
  add column if not exists attorney_notes text,
  add column if not exists wrap_up_draft jsonb,
  add column if not exists post_consult_plan jsonb,
  add column if not exists wrap_up_submitted_at timestamptz;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 27 — document delivery audit trail
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists document_deliveries (
  id                       uuid default gen_random_uuid() primary key,
  document_id              uuid references documents(id) on delete cascade not null,
  case_file_id             uuid references case_files(id) on delete cascade not null,
  user_id                  uuid references profiles(id) on delete set null,
  downloaded_by            uuid references profiles(id) on delete set null,
  downloaded_by_is_attorney boolean not null default false,
  document_status          text,
  watermarked              boolean not null,
  content_sha256           text not null,
  byte_size                integer,
  storage_bucket           text,
  storage_path             text,
  created_at               timestamptz default now() not null
);

create index if not exists document_deliveries_document_idx on document_deliveries (document_id);
create index if not exists document_deliveries_case_file_idx on document_deliveries (case_file_id);
create index if not exists document_deliveries_sha_idx on document_deliveries (content_sha256);

alter table document_deliveries enable row level security;

drop policy if exists "users_read_own_document_deliveries" on document_deliveries;
create policy "users_read_own_document_deliveries"
  on document_deliveries for select using (auth.uid() = user_id);

drop policy if exists "attorneys_read_all_document_deliveries" on document_deliveries;
create policy "attorneys_read_all_document_deliveries"
  on document_deliveries for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Storage bucket for delivery snapshots (create in Dashboard if this fails)
-- ═══════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('document-deliveries', 'document-deliveries', false)
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 28 — consult fee guidance draft
-- ═══════════════════════════════════════════════════════════════════════════
alter table consult_requests
  add column if not exists fee_estimate_draft jsonb;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 29 — existing-counsel intake
-- ═══════════════════════════════════════════════════════════════════════════
alter table case_files
  add column if not exists counsel_intake_at timestamptz,
  add column if not exists has_existing_counsel boolean,
  add column if not exists existing_counsel_name text,
  add column if not exists counsel_engagement_goal text
    check (
      counsel_engagement_goal is null
      or counsel_engagement_goal in (
        'understand_situation',
        'document_review',
        'prepare_for_meeting',
        'second_opinion'
      )
    );

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 30 — document comments (attorney review notes)
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists document_comments (
  id            uuid default gen_random_uuid() primary key,
  document_id   uuid references documents(id) on delete cascade not null,
  author_id     uuid references profiles(id) on delete set null,
  body          text not null,
  resolved      boolean not null default false,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

create index if not exists document_comments_document_id_idx
  on document_comments (document_id, created_at);

alter table document_comments enable row level security;

-- Attorney-only: reuses the stage-11 public.is_attorney() SECURITY DEFINER
-- helper, which avoids the RLS recursion problem. No client policy by design —
-- these comments are private attorney work product.
drop policy if exists "attorneys_manage_document_comments" on document_comments;
create policy "attorneys_manage_document_comments"
  on document_comments for all using (public.is_attorney()) with check (public.is_attorney());

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 31 — direct attorney ⇆ client messaging
-- ═══════════════════════════════════════════════════════════════════════════
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

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 32 — government form PDF templates
-- ═══════════════════════════════════════════════════════════════════════════
-- ── Supabase Storage: gov-form-templates bucket ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('gov-form-templates', 'gov-form-templates', false)
on conflict (id) do nothing;

-- Path layout: {userId}/{caseFileId}/{formInstrumentId}-{fileName}
drop policy if exists "users_upload_own_form_templates" on storage.objects;
create policy "users_upload_own_form_templates"
  on storage.objects for insert
  with check (
    bucket_id = 'gov-form-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "users_read_own_form_templates" on storage.objects;
create policy "users_read_own_form_templates"
  on storage.objects for select
  using (
    bucket_id = 'gov-form-templates'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "attorneys_read_all_form_templates" on storage.objects;
create policy "attorneys_read_all_form_templates"
  on storage.objects for select
  using (
    bucket_id = 'gov-form-templates'
    and exists (
      select 1 from profiles where id = auth.uid() and is_attorney = true
    )
  );

-- ── form_instruments: PDF template state ────────────────────────────────────
alter table form_instruments
  add column if not exists pdf_status text
    check (pdf_status is null or pdf_status in
      ('needs_template', 'mapping', 'ready', 'unsupported')),
  add column if not exists pdf_mode text
    check (pdf_mode is null or pdf_mode in ('acroform', 'flat')),
  add column if not exists pdf_template_path text,
  -- GovFormField.name -> PDF AcroForm field name, auto-derived by label/tooltip
  -- similarity and client-confirmable before first fill. Null until a template
  -- is uploaded; null forever for 'flat' forms (no fields to map).
  add column if not exists pdf_field_map jsonb;

comment on column form_instruments.pdf_status is
  'Lifecycle of the uploaded PDF template: needs_template (none uploaded yet) -> mapping (acroform, field map awaiting confirmation) -> ready (fillable) -> unsupported (flat/scanned, no auto-fill yet).';
comment on column form_instruments.pdf_mode is
  'Detected shape of the uploaded template: acroform (has named form fields) or flat (no fields, would need coordinate overlay).';

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 33 — attorney-user mode
-- ═══════════════════════════════════════════════════════════════════════════
-- ── Account type + manual-approval gate on profiles ─────────────────────────
alter table profiles
  add column if not exists account_type text not null default 'client'
    check (account_type in ('client', 'attorney_user'));

alter table profiles
  add column if not exists attorney_user_status text
    check (attorney_user_status is null or attorney_user_status in ('pending', 'approved', 'rejected'));

alter table profiles
  add column if not exists bar_number text;

alter table profiles
  add column if not exists firm_name text;

-- ── Subscriptions: new plan tier for the attorney toolkit ──────────────────
alter table subscriptions drop constraint if exists subscriptions_plan_check;
alter table subscriptions add constraint subscriptions_plan_check
  check (plan in ('phase2', 'consult', 'attorney_pro'));

-- ── Auto-create profile on signup: carry account_type from signup metadata ──
-- A signup started via the attorney entry point passes
-- options.data.account_type = 'attorney_user'; everyone else keeps the
-- 'client' default. An attorney_user starts 'pending' until manually approved.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  requested_type text := coalesce(new.raw_user_meta_data->>'account_type', 'client');
begin
  insert into public.profiles (id, email, full_name, account_type, attorney_user_status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    case when requested_type = 'attorney_user' then 'attorney_user' else 'client' end,
    case when requested_type = 'attorney_user' then 'pending' else null end
  );
  return new;
end;
$$ language plpgsql security definer;

-- ── Attorney-user subscriber agreement (parallel to representation_agreements) ──
-- A separate table, not a shared "agreement_type" column on
-- representation_agreements: this is NOT a representation agreement (no
-- attorney-client relationship forms), so it deliberately does not share that
-- table's name/semantics. Andrew Crawford authors the actual terms text that
-- gets signed here — see app/onboarding/attorney/page.tsx.
create table if not exists attorney_subscriber_agreements (
  id                  uuid default gen_random_uuid() primary key,
  user_id             uuid references profiles(id) on delete cascade not null,
  signature_name      text not null,
  agreement_version   text not null default '1.0',
  signed_at           timestamptz default now() not null
);

alter table attorney_subscriber_agreements enable row level security;

drop policy if exists "users_read_own_attorney_subscriber_agreements" on attorney_subscriber_agreements;
create policy "users_read_own_attorney_subscriber_agreements"
  on attorney_subscriber_agreements for select using (auth.uid() = user_id);

drop policy if exists "users_insert_own_attorney_subscriber_agreements" on attorney_subscriber_agreements;
create policy "users_insert_own_attorney_subscriber_agreements"
  on attorney_subscriber_agreements for insert with check (auth.uid() = user_id);

-- Andrew (is_attorney) needs to see pending signups to approve/reject them.
drop policy if exists "attorneys_read_all_attorney_subscriber_agreements" on attorney_subscriber_agreements;
create policy "attorneys_read_all_attorney_subscriber_agreements"
  on attorney_subscriber_agreements for select
  using (public.is_attorney());

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 34 — security hardening
-- ═══════════════════════════════════════════════════════════════════════════
-- client-facing profile write path (app/api/account/profile/route.ts) only
-- ever sets full_name/phone/bar_number/firm_name — those stay writable by
-- `authenticated`. email/is_attorney/account_type/attorney_user_status are
-- only ever written by the service role (the signup trigger, the admin
-- attorney-signups decide route, or manual SQL) and now require it.

revoke update on table profiles from authenticated;
grant update (full_name, phone, bar_number, firm_name) on profiles to authenticated;

-- ── Prevent duplicate child documents under concurrent requests ────────────
-- A document can have at most one critical_review child and one second_draft
-- child. Concurrent chat-edit / second-draft-generation calls previously had
-- no DB-level guard against both racing to insert a fresh child at once
-- (each read "no existing child" and both inserted), silently orphaning one.
-- The route now catches the resulting unique-violation and asks the caller
-- to retry instead of creating a duplicate.
create unique index if not exists documents_parent_doctype_unique
  on documents (parent_document_id, doc_type)
  where parent_document_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 35 — consult live session (notepad + recording)
-- ═══════════════════════════════════════════════════════════════════════════

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

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 36 — attorney brainstorm chat
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists case_brainstorm_messages (
  id            uuid default gen_random_uuid() primary key,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  author_id     uuid references profiles(id) on delete set null,
  role          text not null check (role in ('user', 'assistant')),
  content       text not null,
  applied_at    timestamptz,
  created_at    timestamptz default now() not null
);

create index if not exists case_brainstorm_messages_case_file_idx
  on case_brainstorm_messages (case_file_id, created_at);

alter table case_brainstorm_messages enable row level security;

drop policy if exists "attorneys_manage_brainstorm_messages" on case_brainstorm_messages;
create policy "attorneys_manage_brainstorm_messages"
  on case_brainstorm_messages for all using (public.is_attorney());

-- ═══════════════════════════════════════════════════════════════════════════
-- Stage 37 — client home state (jurisdiction gating)
-- ═══════════════════════════════════════════════════════════════════════════
alter table profiles
  add column if not exists home_state text;

comment on column profiles.home_state is
  'US state/territory code (or OTHER). TX = full Instant Attorney depth; all other states use Local Counsel Prep mode.';

-- Extend the column-scoped UPDATE grant from stage34 so clients can save this
-- field through the profile API (service-role writes also work for onboarding).
grant update (full_name, phone, bar_number, firm_name, home_state) on profiles to authenticated;
