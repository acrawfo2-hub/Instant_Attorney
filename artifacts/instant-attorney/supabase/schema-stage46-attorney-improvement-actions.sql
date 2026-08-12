-- Stage 46: actionable attorney findings, stable anchors and reviewable diffs.
alter table document_improvements drop constraint if exists document_improvements_status_check;
alter table document_improvements add constraint document_improvements_status_check
  check (status in ('proposed','accepted','rejected','ask_partner','needs_client_input','superseded'));
alter table document_improvements add column if not exists anchor jsonb;
alter table document_improvements add column if not exists proposed_diff jsonb;
alter table document_improvements add column if not exists attorney_rationale text not null default '';
alter table document_improvements add column if not exists disposition_by uuid references profiles(id) on delete set null;
alter table document_improvements add column if not exists disposition_at timestamptz;
alter table document_improvements add column if not exists evidence_hash text;
alter table document_improvements add column if not exists updated_at timestamptz default now() not null;
create index if not exists document_improvements_evidence_idx
  on document_improvements (document_id, evidence_hash, status);
