-- Stage 47: durable, independently executable document generation jobs.
create table if not exists document_generation_jobs (
  id                  uuid default gen_random_uuid() primary key,
  case_file_id        uuid references case_files(id) on delete cascade not null,
  user_id             uuid references profiles(id) on delete cascade not null,
  workspace_draft_id  uuid references client_workspace_drafts(id) on delete set null,
  document_type       text not null,
  title               text not null,
  status              text not null default 'queued'
                        check (status in ('queued','drafting','waiting_for_facts','checking','ready','failed','cancelled')),
  priority            smallint not null default 0 check (priority between 0 and 100),
  input_fact_revision bigint not null default 0,
  plan_revision       bigint not null,
  generation_attempt  integer not null default 0 check (generation_attempt >= 0),
  error               text,
  idempotency_key     text not null unique,
  created_at          timestamptz default now() not null,
  started_at          timestamptz,
  updated_at          timestamptz default now() not null,
  completed_at        timestamptz
);

create index if not exists document_generation_jobs_queue_idx
  on document_generation_jobs (status, priority desc, created_at);
create index if not exists document_generation_jobs_case_idx
  on document_generation_jobs (case_file_id, created_at desc);

alter table document_generation_jobs enable row level security;
drop policy if exists "clients_read_own_document_jobs" on document_generation_jobs;
create policy "clients_read_own_document_jobs" on document_generation_jobs
  for select using (user_id = auth.uid());

-- Mutations intentionally have no client policy. Dispatchers and workers use
-- the service role, preventing clients from claiming or completing jobs.
