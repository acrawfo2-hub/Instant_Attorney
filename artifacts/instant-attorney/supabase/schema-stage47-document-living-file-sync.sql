-- Durable, revision-scoped document → Living File synchronization.
alter table public.documents add column if not exists current_revision_id uuid;
alter table public.documents add column if not exists living_file_sync_status text not null default 'pending'
  check (living_file_sync_status in ('pending', 'synced', 'failed'));
alter table public.documents add column if not exists living_file_sync_error text;
alter table public.documents add column if not exists living_file_synced_at timestamptz;

alter table public.fact_items add column if not exists source_document_id uuid references public.documents(id) on delete cascade;
alter table public.fact_items add column if not exists source_revision_id uuid;
create index if not exists fact_items_document_revision_idx
  on public.fact_items(source_document_id, source_revision_id) where status = 'gap';
