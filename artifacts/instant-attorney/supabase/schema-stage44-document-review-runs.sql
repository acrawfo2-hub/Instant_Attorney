-- Instant Attorney — Stage 44: Attorney review runs + structured improvements
-- Run this in the Supabase SQL editor (production project).
--
-- Moves attorney document review from a manual button "rail" to an
-- orchestrator-driven run that auto-kicks off on submission. A run drives the
-- pipeline (issue-spotting -> revised draft -> [later] QA gates -> memo/email),
-- and its findings are stored as structured, individually-actionable
-- `document_improvements` rather than a single prose blob.
--
-- Writes happen server-side via the service client during the run; the attorney
-- reads via RLS. Rows are scoped to the reviewing attorney (any is_attorney
-- profile) — the same boundary the existing attorney review endpoints enforce.

-- ── Review runs ──────────────────────────────────────────────────────────────
create table if not exists document_review_runs (
  id            uuid default gen_random_uuid() primary key,
  document_id   uuid references documents(id) on delete cascade not null,
  case_file_id  uuid references case_files(id) on delete cascade not null,
  -- queued: created, not yet picked up. running: processing. awaiting_attorney:
  -- needs a one-click answer (later phases). complete / failed: terminal.
  status        text not null default 'queued'
                  check (status in ('queued','running','awaiting_attorney','complete','failed')),
  -- Human-readable current stage, e.g. 'improvements', 'revised_draft'.
  stage         text,
  error         text,
  -- Rough token accounting for cost visibility (usage-tracker holds the ledger).
  input_tokens  integer not null default 0,
  output_tokens integer not null default 0,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null,
  completed_at  timestamptz
);

create index if not exists document_review_runs_doc_idx
  on document_review_runs (document_id, created_at desc);

-- ── Structured improvements (the review's findings) ──────────────────────────
create table if not exists document_improvements (
  id              uuid default gen_random_uuid() primary key,
  run_id          uuid references document_review_runs(id) on delete cascade not null,
  document_id     uuid references documents(id) on delete cascade not null,
  -- Display order within the run (1-based).
  seq             integer not null default 0,
  -- The section of the draft this touches, e.g. 'Section 3' or 'Signature block'.
  section         text,
  -- blocking | goal_gap | clarity | risk | compliance | citation
  kind            text not null default 'clarity'
                    check (kind in ('blocking','goal_gap','clarity','risk','compliance','citation')),
  -- high | medium | low
  severity        text not null default 'medium'
                    check (severity in ('high','medium','low')),
  title           text not null,
  rationale       text not null default '',
  proposed_change text not null default '',
  -- proposed: as generated. accepted/rejected: attorney decision (later phases).
  -- superseded: replaced by a newer run.
  status          text not null default 'proposed'
                    check (status in ('proposed','accepted','rejected','superseded')),
  created_at      timestamptz default now() not null
);

create index if not exists document_improvements_run_idx
  on document_improvements (run_id, seq);
create index if not exists document_improvements_doc_idx
  on document_improvements (document_id, created_at desc);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table document_review_runs enable row level security;
alter table document_improvements enable row level security;

-- Attorneys (is_attorney) read review runs; writes are server-side (service
-- client), so no insert/update policy is needed for the app role.
drop policy if exists "attorneys_read_review_runs" on document_review_runs;
create policy "attorneys_read_review_runs"
  on document_review_runs for select
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_attorney = true
  ));

drop policy if exists "attorneys_read_improvements" on document_improvements;
create policy "attorneys_read_improvements"
  on document_improvements for select
  using (exists (
    select 1 from profiles p where p.id = auth.uid() and p.is_attorney = true
  ));
