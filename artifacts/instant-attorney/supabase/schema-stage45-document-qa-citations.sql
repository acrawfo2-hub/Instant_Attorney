-- Instant Attorney — Stage 45: Authorities QA gate (citation verification)
-- Run this in the Supabase SQL editor (production project).
--
-- Phase 2 of the attorney review orchestrator (see
-- docs/attorney-review-orchestrator.md). After the revised draft is produced, the
-- Authorities gate extracts every FORMAL legal citation from it and verifies each
-- one — cases and statutes via live web search — so a mis-identified case can
-- never silently reach the client. Each citation is a row here with a verdict; an
-- unverified/unsupported/error citation BLOCKS approval until it is verified,
-- removed, or explicitly waived by the attorney.
--
-- Verification runs on a low-cost model (Haiku) and batches all citations into a
-- single web-search pass to keep server-tool spend minimal.

create table if not exists document_qa_citations (
  id             uuid default gen_random_uuid() primary key,
  run_id         uuid references document_review_runs(id) on delete cascade not null,
  document_id    uuid references documents(id) on delete cascade not null,
  -- The citation exactly as it appears in the revised draft.
  raw            text not null,
  -- case | statute | rule | other
  citation_type  text not null default 'other'
                   check (citation_type in ('case','statute','rule','other')),
  -- What the draft asserts this authority supports (for holding-match checking).
  claim          text not null default '',
  -- verified: confirmed real and on-point. unverified: could not confirm it exists.
  -- unsupported: it exists but does not support the claim. error: verification
  -- could not run (treated as blocking — fail safe).
  verdict        text not null default 'unverified'
                   check (verdict in ('verified','unverified','unsupported','error')),
  -- Short human explanation of the verdict / holding match.
  evidence       text not null default '',
  -- The source URL that verified it, when found.
  source_url     text,
  -- Attorney override: a waived citation no longer blocks approval.
  waived         boolean not null default false,
  waived_at      timestamptz,
  created_at     timestamptz default now() not null
);

create index if not exists document_qa_citations_run_idx
  on document_qa_citations (run_id, created_at);
create index if not exists document_qa_citations_doc_idx
  on document_qa_citations (document_id, created_at desc);

alter table document_qa_citations enable row level security;

-- Attorneys (is_attorney) read; the gate writes server-side via the service
-- client, and the waive action updates server-side too, so no client
-- insert/update policy is needed for the app role.
drop policy if exists "attorneys_read_qa_citations" on document_qa_citations;
create policy "attorneys_read_qa_citations"
  on document_qa_citations for select
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_attorney = true
  ));
