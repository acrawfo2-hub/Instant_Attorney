-- Stage 48: immutable document history and mutable editor buffers.
--
-- SUPERSEDES stage 46's document_revisions. That table shipped a linear
-- revision_number/draft_text/reason shape; this one records provenance
-- (author_type, source_action) and supports branching via parent_revision_id.
--
-- The old table may already exist in a deployed database, and
-- `create table if not exists` would silently no-op against it, leaving every
-- insert below failing on columns that were never created. So it is dropped
-- first — but only after proving it holds no data. If it has rows, this stops
-- rather than destroying revision history: migrate them deliberately instead.
do $$
begin
  if to_regclass('public.document_revisions') is not null
     and exists (select 1 from public.document_revisions limit 1) then
    raise exception
      'document_revisions holds rows under the stage 46 shape. Stage 48 supersedes it; migrate those rows before running this.';
  end if;
end $$;

drop table if exists public.document_revisions cascade;
-- Revisions belong to the top-level document even when the current work product
-- is stored in a child `second_draft` row.

create table if not exists document_revisions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete restrict,
  parent_revision_id uuid references document_revisions(id) on delete restrict,
  content text not null,
  title text not null,
  author_type text not null check (author_type in ('client','attorney','ai','system')),
  attorney_id uuid references profiles(id) on delete restrict,
  source_action text not null check (source_action in (
    'client_submitted','ai_patch_before','ai_patch_after',
    'orchestrator_rewrite_before','orchestrator_rewrite_after',
    'manual_restore_before','manual_restore_after','branch',
    'approval','delivery'
  )),
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attorney_revision_has_attorney check
    (author_type <> 'attorney' or attorney_id is not null)
);

create index if not exists document_revisions_document_created_idx
  on document_revisions(document_id, created_at desc);

-- Keystroke/autosave traffic goes here. It is deliberately one mutable row per
-- document and is promoted to document_revisions only at a meaningful boundary.
create table if not exists document_working_buffers (
  document_id uuid primary key references documents(id) on delete cascade,
  base_revision_id uuid references document_revisions(id) on delete restrict,
  content text not null default '',
  title text not null default '',
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preserve every existing top-level client draft as the submitted baseline.
insert into document_revisions (document_id, content, title, author_type, source_action, summary, created_at)
select d.id, coalesce(d.draft_text, ''), d.title, 'client', 'client_submitted',
       'Client-submitted original', coalesce(d.submitted_at, d.created_at, now())
from documents d
where d.parent_document_id is null
  and not exists (select 1 from document_revisions r where r.document_id=d.id and r.source_action='client_submitted');

-- QA results are reproducible only when pinned to the bytes they evaluated.
alter table document_review_runs
  add column if not exists revision_id uuid references document_revisions(id) on delete restrict;
alter table document_qa_citations
  add column if not exists revision_id uuid references document_revisions(id) on delete restrict;
create index if not exists document_review_runs_revision_idx on document_review_runs(revision_id);
create index if not exists document_qa_citations_revision_idx on document_qa_citations(revision_id);

-- Approval and delivery are status transitions elsewhere in the application
-- (including signing webhooks). Capture them centrally so no path can omit the
-- protected snapshot. Child draft content is preferred when present.
create or replace function checkpoint_final_document_status()
returns trigger language plpgsql security definer set search_path=public as $$
declare top_id uuid; snapshot_content text; snapshot_title text; prior uuid;
begin
  if new.status not in ('approved','delivered') or new.status is not distinct from old.status then return new; end if;
  top_id := coalesce(new.parent_document_id, new.id);
  select r.id into prior from document_revisions r where r.document_id=top_id order by r.created_at desc limit 1;
  select coalesce(c.draft_text, d.draft_text, ''), coalesce(c.title, d.title)
    into snapshot_content, snapshot_title from documents d
    left join lateral (select x.draft_text, x.title from documents x
      where x.parent_document_id=top_id and x.doc_type='second_draft' and x.draft_text is not null
      order by x.updated_at desc limit 1) c on true where d.id=top_id;
  if snapshot_content is not null then
    insert into document_revisions(document_id,parent_revision_id,content,title,author_type,
      attorney_id,source_action,summary)
    values(top_id,prior,snapshot_content,snapshot_title,'system',null,
      case when new.status='approved' then 'approval' else 'delivery' end,
      case when new.status='approved' then 'Attorney-approved snapshot' else 'Delivered snapshot' end);
  end if;
  return new;
end $$;
drop trigger if exists documents_final_revision on documents;
create trigger documents_final_revision after update of status on documents
for each row execute function checkpoint_final_document_status();

-- Pin newly-created QA records to the latest immutable checkpoint. Producers
-- may explicitly provide a revision (preferred); this is the fail-safe.
create or replace function pin_qa_to_revision()
returns trigger language plpgsql as $$
begin
  if new.revision_id is null then
    select r.id into new.revision_id from document_revisions r
      where r.document_id=new.document_id order by r.created_at desc limit 1;
  end if;
  if new.revision_id is null then raise exception 'QA result requires a document revision'; end if;
  return new;
end $$;
drop trigger if exists review_runs_pin_revision on document_review_runs;
create trigger review_runs_pin_revision before insert on document_review_runs
for each row execute function pin_qa_to_revision();
drop trigger if exists qa_citations_pin_revision on document_qa_citations;
create trigger qa_citations_pin_revision before insert on document_qa_citations
for each row execute function pin_qa_to_revision();

update document_review_runs q set revision_id=(select r.id from document_revisions r
  where r.document_id=q.document_id order by r.created_at desc limit 1) where q.revision_id is null;
update document_qa_citations q set revision_id=(select r.id from document_revisions r
  where r.document_id=q.document_id order by r.created_at desc limit 1) where q.revision_id is null;
alter table document_review_runs alter column revision_id set not null;
alter table document_qa_citations alter column revision_id set not null;

-- Append-only: even service-role application mistakes cannot rewrite protected
-- history. The original/approved/delivered rows therefore cannot be overwritten
-- or deleted (and neither can any other checkpoint).
create or replace function reject_document_revision_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'document revisions are immutable';
end $$;
drop trigger if exists document_revisions_immutable on document_revisions;
create trigger document_revisions_immutable
before update or delete on document_revisions
for each row execute function reject_document_revision_mutation();

alter table document_revisions enable row level security;
alter table document_working_buffers enable row level security;
create policy "owners_and_attorneys_read_revisions" on document_revisions for select
using (exists (select 1 from documents d where d.id = document_id and
  (d.user_id = auth.uid() or exists (select 1 from profiles p where p.id=auth.uid() and p.is_attorney))));
create policy "attorneys_manage_working_buffers" on document_working_buffers for all
using (exists (select 1 from profiles p where p.id=auth.uid() and p.is_attorney))
with check (exists (select 1 from profiles p where p.id=auth.uid() and p.is_attorney));


-- Rewire stage 46's placeholder-answer function onto this shape. It inserted
-- revision_number/draft_text/reason, none of which exist here. documents.
-- revision_number is untouched: that is the optimistic-lock counter on the
-- document row, a different thing from a revision's identity.
create or replace function apply_document_placeholder_revision(
  p_document_id uuid, p_expected_revision integer, p_text text, p_actor uuid
) returns table(revision_number integer, status text, review_state text, requires_review boolean)
language plpgsql security definer set search_path = public, pg_temp as $$
declare d documents%rowtype; next_revision integer; needs_review boolean;
begin
  select * into d from documents where id = p_document_id for update;
  if not found then raise exception 'document_not_found'; end if;
  if d.revision_number <> p_expected_revision then raise exception 'revision_conflict'; end if;
  needs_review := d.status not in ('draft', 'pre_warmed');
  next_revision := d.revision_number + 1;

  if d.status in ('approved', 'delivered') and d.approved_text is null then
    update documents set approved_text = d.draft_text, approved_revision = d.revision_number
      where id = d.id;
  end if;

  insert into document_revisions(document_id, content, title, author_type, source_action, summary)
  values(d.id, p_text, d.title, 'client', 'client_submitted', 'client_placeholder_answer');

  update documents set draft_text = p_text, revision_number = next_revision,
    status = case when needs_review then 'pending_review' else 'draft' end,
    review_status = null,
    reviewed_at = case when needs_review then null else reviewed_at end,
    reviewed_by = case when needs_review then null else reviewed_by end,
    updated_at = now()
  where id = d.id;

  return query select next_revision, (case when needs_review then 'pending_review' else 'draft' end)::text,
                      null::text, needs_review;
end $$;
