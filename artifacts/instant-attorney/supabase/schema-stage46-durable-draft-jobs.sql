-- Durable, per-document generation state. Unlike lib/acp-jobs.ts this survives
-- deploys/restarts and allows sibling documents to finish independently.
create table if not exists workspace_draft_jobs (
  id uuid default gen_random_uuid() primary key,
  case_file_id uuid references case_files(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade not null,
  document_key text not null,
  title text not null,
  state text not null default 'preparing' check (state in
    ('preparing','drafting','waiting_for_facts','checking','ready','failed','cancelled')),
  missing_fact_labels text[] not null default '{}',
  latest_revision integer not null default 0 check (latest_revision >= 0),
  workspace_draft_id uuid references client_workspace_drafts(id) on delete set null,
  failure_code text,
  failure_message text,
  generation_token uuid not null default gen_random_uuid(),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (case_file_id, document_key, generation_token)
);

create index if not exists workspace_draft_jobs_case_status_idx
  on workspace_draft_jobs (case_file_id, updated_at desc);

alter table workspace_draft_jobs enable row level security;
drop policy if exists "clients_read_own_draft_jobs" on workspace_draft_jobs;
create policy "clients_read_own_draft_jobs" on workspace_draft_jobs for select
  using (user_id = auth.uid());

-- Promotion is idempotent even under two concurrent clicks/retries. The API's
-- fast path handles an existing link; this index closes the pre-link race.
create unique index if not exists documents_workspace_draft_once_idx
  on documents ((content_json->>'workspace_draft_id'))
  where content_json->>'workspace_draft_id' is not null;

-- Workers use the service role. Cancellation is performed by the authenticated
-- API after checking ownership, rather than exposing arbitrary client updates.
