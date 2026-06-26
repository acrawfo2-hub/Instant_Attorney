-- Instant Attorney — Stage 8 Schema Additions
-- Run this AFTER schema-stage7.sql in the Supabase SQL editor
-- Derived documents (critical review memo, second draft) link to a parent wizard draft.

alter table documents
  add column if not exists parent_document_id uuid references documents(id) on delete cascade,
  add column if not exists attorney_second_draft_prompt text;

create index if not exists documents_parent_document_id_idx
  on documents (parent_document_id)
  where parent_document_id is not null;
