-- Section-aware document generation and coalesced refinement queue.
create table if not exists public.document_sections (
  document_id uuid not null references public.documents(id) on delete cascade,
  section_id text not null,
  section_kind text not null,
  rendered_text text not null,
  fact_keys text[] not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (document_id, section_id)
);

create index if not exists document_sections_fact_keys_idx
  on public.document_sections using gin (fact_keys);

create table if not exists public.document_refresh_jobs (
  document_id uuid primary key references public.documents(id) on delete cascade,
  changed_fact_keys text[] not null default '{}',
  affected_section_ids text[] not null default '{}',
  run_after timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'complete', 'failed')),
  updated_at timestamptz not null default now()
);

alter table public.document_sections enable row level security;
alter table public.document_refresh_jobs enable row level security;

alter table public.documents add column if not exists consistency_status text
  check (consistency_status in ('pending', 'pass', 'fail'));

-- One row per draft is the database-level debounce/coalescing guarantee.
create or replace function public.enqueue_document_refresh(
  p_document_id uuid,
  p_changed_fact_keys text[],
  p_affected_section_ids text[],
  p_debounce_ms integer default 2000
) returns void language sql security definer set search_path = public as $$
  insert into document_refresh_jobs(document_id, changed_fact_keys, affected_section_ids, run_after, status)
  values (p_document_id, p_changed_fact_keys, p_affected_section_ids,
          now() + make_interval(secs => p_debounce_ms::double precision / 1000), 'pending')
  on conflict (document_id) do update set
    changed_fact_keys = array(select distinct unnest(document_refresh_jobs.changed_fact_keys || excluded.changed_fact_keys)),
    affected_section_ids = array(select distinct unnest(document_refresh_jobs.affected_section_ids || excluded.affected_section_ids)),
    run_after = excluded.run_after,
    status = 'pending',
    updated_at = now();
$$;
