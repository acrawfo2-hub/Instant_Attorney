-- Stage 47: revisioned, dependency-aware document generation.
-- The database owns revision advancement so every writer (client, worker,
-- attorney tools, and future endpoints) participates without route-specific code.

alter table case_files add column if not exists drafting_revision bigint not null default 0;

create or replace function bump_case_drafting_revision(p_case_file_id uuid)
returns void language sql security definer set search_path = public as $$
  update case_files set drafting_revision = drafting_revision + 1, updated_at = now()
  where id = p_case_file_id;
$$;

create or replace function bump_child_case_drafting_revision()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform bump_case_drafting_revision(coalesce(new.case_file_id, old.case_file_id));
  return coalesce(new, old);
end;
$$;

-- Facts, evidence versions, and requested-document resolutions are all drafting inputs.
drop trigger if exists fact_items_bump_drafting_revision on fact_items;
create trigger fact_items_bump_drafting_revision after insert or update or delete on fact_items
for each row execute function bump_child_case_drafting_revision();

drop trigger if exists attachments_bump_drafting_revision on attachments;
create trigger attachments_bump_drafting_revision after insert or update or delete on attachments
for each row execute function bump_child_case_drafting_revision();

drop trigger if exists requested_attachments_bump_drafting_revision on requested_attachments;
create trigger requested_attachments_bump_drafting_revision after insert or update or delete on requested_attachments
for each row execute function bump_child_case_drafting_revision();

create or replace function bump_case_strategy_drafting_revision()
returns trigger language plpgsql as $$
begin
  if old.legal_strategy is distinct from new.legal_strategy
     or old.goals is distinct from new.goals
     or old.attorney_assessment is distinct from new.attorney_assessment
     or old.next_action is distinct from new.next_action
     or old.matter_type is distinct from new.matter_type
     or old.matter_subtype is distinct from new.matter_subtype then
    new.drafting_revision := old.drafting_revision + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists case_files_bump_strategy_revision on case_files;
create trigger case_files_bump_strategy_revision before update on case_files
for each row execute function bump_case_strategy_drafting_revision();

create table if not exists document_generation_jobs (
  id uuid primary key,
  case_file_id uuid not null references case_files(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  input_revision bigint not null,
  fact_keys jsonb not null default '[]' check (jsonb_typeof(fact_keys) = 'array'),
  attachment_versions jsonb not null default '[]' check (jsonb_typeof(attachment_versions) = 'array'),
  status text not null default 'queued' check (status in ('queued', 'running', 'completed', 'rejected', 'failed')),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists document_generation_jobs_case_idx on document_generation_jobs(case_file_id, created_at desc);
alter table document_generation_jobs enable row level security;
create policy "users_read_own_generation_jobs" on document_generation_jobs for select using (user_id = auth.uid());

alter table client_workspace_drafts
  add column if not exists logical_document_key text,
  add column if not exists current_generation_revision bigint not null default 0,
  add column if not exists generation_status text not null default 'idle',
  add column if not exists missing_fact_keys jsonb not null default '[]',
  add column if not exists last_generation_job_id uuid references document_generation_jobs(id) on delete set null;

alter table client_workspace_drafts drop constraint if exists client_workspace_drafts_generation_status_check;
alter table client_workspace_drafts add constraint client_workspace_drafts_generation_status_check
  check (generation_status in ('idle', 'generating', 'current', 'stale', 'failed'));
create unique index if not exists client_workspace_drafts_logical_key_idx
  on client_workspace_drafts(case_file_id, user_id, logical_document_key)
  where logical_document_key is not null;

create table if not exists client_workspace_draft_dependencies (
  draft_id uuid not null references client_workspace_drafts(id) on delete cascade,
  dependency_type text not null check (dependency_type in ('fact', 'attachment')),
  dependency_key text not null,
  attachment_version text,
  generation_job_id uuid references document_generation_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (draft_id, dependency_type, dependency_key)
);
alter table client_workspace_draft_dependencies enable row level security;
create policy "users_read_own_draft_dependencies" on client_workspace_draft_dependencies for select
using (exists (select 1 from client_workspace_drafts d where d.id = draft_id and d.user_id = auth.uid()));

create table if not exists rejected_draft_generations (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid references client_workspace_drafts(id) on delete cascade,
  generation_job_id uuid references document_generation_jobs(id) on delete set null,
  input_revision bigint not null,
  content text not null,
  reason text not null,
  archived_at timestamptz not null default now()
);
alter table rejected_draft_generations enable row level security;

-- Atomic compare-and-accept. The title lookup is deliberately last and only
-- migrates a legacy row which has no logical key yet.
create or replace function accept_client_workspace_draft_generation(
  p_case_file_id uuid, p_user_id uuid, p_logical_document_key text, p_title text,
  p_content text, p_job_id uuid, p_input_revision bigint, p_fact_keys jsonb,
  p_attachment_versions jsonb, p_missing_fact_keys jsonb
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_draft client_workspace_drafts%rowtype; v_fact text; v_attachment jsonb;
begin
  select * into v_draft from client_workspace_drafts
   where case_file_id = p_case_file_id and user_id = p_user_id
     and logical_document_key = p_logical_document_key for update;
  if not found then
    select * into v_draft from client_workspace_drafts
     where case_file_id = p_case_file_id and user_id = p_user_id
       and logical_document_key is null and title = p_title
     order by updated_at desc limit 1 for update;
  end if;
  if found and v_draft.current_generation_revision > p_input_revision then
    insert into rejected_draft_generations(draft_id, generation_job_id, input_revision, content, reason)
    values (v_draft.id, p_job_id, p_input_revision, p_content, 'newer generation already accepted');
    update document_generation_jobs set status = 'rejected', completed_at = now() where id = p_job_id;
    return null;
  end if;
  if not found then
    insert into client_workspace_drafts(case_file_id,user_id,title,content,source,logical_document_key,
      current_generation_revision,generation_status,missing_fact_keys,last_generation_job_id)
    values(p_case_file_id,p_user_id,p_title,p_content,'assistant',p_logical_document_key,
      p_input_revision,'current',p_missing_fact_keys,p_job_id) returning * into v_draft;
  else
    update client_workspace_drafts set title=p_title,content=p_content,source='assistant',
      logical_document_key=p_logical_document_key,current_generation_revision=p_input_revision,
      generation_status='current',missing_fact_keys=p_missing_fact_keys,last_generation_job_id=p_job_id,updated_at=now()
    where id=v_draft.id returning * into v_draft;
  end if;
  delete from client_workspace_draft_dependencies where draft_id=v_draft.id;
  for v_fact in select jsonb_array_elements_text(p_fact_keys) loop
    insert into client_workspace_draft_dependencies values(v_draft.id,'fact',v_fact,null,p_job_id,now());
  end loop;
  for v_attachment in select * from jsonb_array_elements(p_attachment_versions) loop
    insert into client_workspace_draft_dependencies values(v_draft.id,'attachment',v_attachment->>'id',v_attachment->>'version',p_job_id,now());
  end loop;
  return v_draft.id;
end;
$$;
