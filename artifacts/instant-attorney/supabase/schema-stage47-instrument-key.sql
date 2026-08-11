-- Stable legal-instrument identity, independent of doc_type (rendering engine)
-- and title (human-readable presentation).
alter table public.documents
  add column if not exists instrument_key text;

update public.documents
set instrument_key = nullif(content_json->>'instrument_key', '')
where instrument_key is null;

create index if not exists documents_case_instrument_idx
  on public.documents(case_file_id, instrument_key)
  where parent_document_id is null and instrument_key is not null;
