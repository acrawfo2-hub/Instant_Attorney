-- Instant Attorney — Stage 23 Schema Additions
-- Run this AFTER schema-stage22-archive-destruction.sql in the Supabase SQL editor.
--
-- Milestone 1 of the Financial Picture spec (docs/financial-picture-spec.md):
-- the structured financial layer for asset-dependent matters (family law,
-- bankruptcy, estate planning) plus the per-matter representation context that
-- drives correct partner handling, and the client's acknowledgment of the
-- financial-disclosure standard.
--
-- Idempotent — safe to re-run.

-- ── Per-matter representation context + disclosure acknowledgment ────────────
-- These columns on case_files make the app "know which world it is in" before it
-- collects anything about a partner, and record that the client acknowledged the
-- full-disclosure standard before entering finances.
alter table case_files
  add column if not exists representation_scope text not null default 'single_client'
    check (representation_scope in ('single_client', 'joint_spouses')),
  add column if not exists partner_role text not null default 'none'
    check (partner_role in ('none', 'adverse_party', 'joint_client', 'non_client_third_party')),
  add column if not exists partner_consented boolean not null default false,
  add column if not exists joint_no_secrets_ack boolean not null default false,
  add column if not exists financial_disclosure_acked_at timestamptz,
  add column if not exists financial_disclosure_version text;

-- ── Financial items — the structured asset/debt/income ledger ────────────────
-- Each row carries the three metadata axes from the spec:
--   1. Ownership + relationship  (owner, characterization, exempt_status)
--   2. Provenance + verification (provenance, verification_status, source_attachment_id)
--   3. Phase + privilege         (phase_collected, privileged)
-- Values are ranges (low/high) to avoid false precision on client estimates.
-- Raw identifiers (account numbers, SSNs) are intentionally NOT stored here —
-- that is Milestone 5 (a separate encrypted vault). `label` holds only a
-- redacted, human description (e.g. "Chase checking ••4321").
create table if not exists financial_items (
  id                     uuid default gen_random_uuid() primary key,
  case_file_id           uuid references case_files(id) on delete cascade not null,
  user_id                uuid references profiles(id) on delete cascade not null,

  -- WHAT
  category               text not null
    check (category in (
      'real_property', 'vehicle', 'financial_account', 'retirement_account',
      'business_interest', 'personal_property', 'life_insurance', 'receivable',
      'secured_debt', 'unsecured_debt', 'income_source', 'recurring_expense'
    )),
  label                  text not null,
  acquisition_note       text,

  -- AXIS 1: ownership + relationship
  owner                  text not null default 'client'
    check (owner in ('client', 'partner', 'joint', 'other_third_party')),
  characterization       text not null default 'mixed_or_unknown'
    check (characterization in (
      'community', 'separate_client', 'separate_partner', 'mixed_or_unknown', 'not_applicable'
    )),
  exempt_status          text not null default 'unknown'
    check (exempt_status in ('exempt', 'non_exempt', 'partial', 'unknown', 'not_applicable')),

  -- VALUE (ranges)
  value_low              numeric(14, 2),
  value_high             numeric(14, 2),
  value_basis            text not null default 'client_estimate'
    check (value_basis in (
      'client_estimate', 'account_statement', 'appraisal', 'tax_assessment',
      'contract_or_title', 'other_document'
    )),
  valued_as_of           date,

  -- AXIS 2: provenance + verification
  provenance             text not null default 'client_asserted'
    check (provenance in ('client_asserted', 'document_extracted', 'attorney_verified')),
  verification_status    text not null default 'unverified'
    check (verification_status in ('unverified', 'doc_supported', 'attorney_verified')),
  source_attachment_id   uuid references attachments(id) on delete set null,

  -- AXIS 3: phase + privilege
  phase_collected        text not null default 'phase_2_privileged'
    check (phase_collected in ('phase_1_unprivileged', 'phase_2_privileged')),
  privileged             boolean not null default true,

  -- integrity / workflow
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

-- RLS mirrors the hardened fact_items policy: the caller must own BOTH the row
-- (user_id) AND the referenced case_file, on read and write. App writes go
-- through the service-role client (which bypasses RLS); this constrains direct
-- user-JWT PostgREST access and blocks cross-case poisoning.
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

-- Attorneys may read all financial items (for review). Mirrors the attorney
-- read policies on top_up_ledger / consult_requests.
drop policy if exists "attorneys_read_all_financial_items" on financial_items;
create policy "attorneys_read_all_financial_items"
  on financial_items for select using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );
