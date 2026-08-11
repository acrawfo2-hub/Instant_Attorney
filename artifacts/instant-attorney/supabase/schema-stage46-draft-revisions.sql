-- Assistant revisions must never destroy client edits or mutate a document that
-- has entered attorney review. Keep the proposed revision as a linked draft.
alter table client_workspace_drafts
  add column if not exists revision_of_draft_id uuid
  references client_workspace_drafts(id) on delete set null;

create index if not exists client_workspace_drafts_revision_idx
  on client_workspace_drafts (revision_of_draft_id)
  where revision_of_draft_id is not null;
