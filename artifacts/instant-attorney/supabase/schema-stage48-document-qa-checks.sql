-- Independently addressable adversarial QA findings for the active working revision.
create table if not exists public.document_qa_findings (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.document_review_runs(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  check_type text not null check (check_type in ('factual_consistency','completeness','defined_terms_cross_references','blanks_execution_blocks','formatting_court_requirements','client_comprehension','authorities')),
  severity text not null check (severity in ('blocking','high','medium','low')),
  document_location text not null default 'Document-wide',
  title text not null,
  evidence text not null,
  status text not null default 'open' check (status in ('open','resolved','waived')),
  resolution_note text,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  last_run_revision text not null,
  automated boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_qa_findings_document_idx on public.document_qa_findings(document_id, check_type);
alter table public.document_qa_findings enable row level security;
create policy "attorneys manage document qa findings" on public.document_qa_findings for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_attorney = true)
) with check (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_attorney = true)
);

create table if not exists public.document_qa_check_runs (
  document_id uuid not null references public.documents(id) on delete cascade,
  run_id uuid not null references public.document_review_runs(id) on delete cascade,
  check_type text not null check (check_type in ('factual_consistency','completeness','defined_terms_cross_references','blanks_execution_blocks','formatting_court_requirements','client_comprehension','authorities')),
  last_run_revision text not null,
  completed_at timestamptz not null default now(),
  primary key (document_id, check_type)
);
alter table public.document_qa_check_runs enable row level security;
create policy "attorneys manage document qa check runs" on public.document_qa_check_runs for all using (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_attorney = true)
) with check (
  exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_attorney = true)
);
