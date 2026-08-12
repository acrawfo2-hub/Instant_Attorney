-- Revision-aware client answers and review publication.
alter table documents add column if not exists revision_number integer not null default 1;
alter table documents add column if not exists approved_text text;
alter table documents add column if not exists approved_revision integer;
alter table document_review_runs add column if not exists source_revision integer;
alter table document_review_runs drop constraint if exists document_review_runs_status_check;
alter table document_review_runs add constraint document_review_runs_status_check
  check (status in ('queued','running','awaiting_attorney','complete','failed','stale'));

create table if not exists document_revisions (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null,
  revision_number integer not null,
  draft_text text not null,
  reason text not null,
  requires_attorney_approval boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  unique(document_id, revision_number)
);

-- The expected revision makes the write an optimistic transaction: an answer
-- racing an attorney run (or another answer) cannot overwrite a newer version.
create or replace function apply_document_placeholder_revision(
  p_document_id uuid, p_expected_revision integer, p_text text, p_actor uuid
) returns table(revision_number integer, status text, review_state text, requires_review boolean)
language plpgsql security definer set search_path = public as $$
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

  insert into document_revisions(document_id, revision_number, draft_text, reason,
    requires_attorney_approval, created_by)
  values(d.id, next_revision, p_text, 'client_placeholder_answer', needs_review, p_actor);

  update documents set draft_text = p_text, revision_number = next_revision,
    status = case when needs_review then 'pending_review' else 'draft' end,
    review_status = null,
    reviewed_at = case when needs_review then null else reviewed_at end,
    reviewed_by = case when needs_review then null else reviewed_by end,
    updated_at = now()
  where id = d.id;

  update document_review_runs set status = 'stale', stage = 'stale',
    error = 'Document changed after this review began', updated_at = now()
  where document_id = d.id and status in ('queued','running','complete')
    and coalesce(source_revision, 0) < next_revision;

  return query select next_revision,
    case when needs_review then 'pending_review' else 'draft' end,
    case when needs_review then 'queued' else 'not_required' end,
    needs_review;
end $$;
