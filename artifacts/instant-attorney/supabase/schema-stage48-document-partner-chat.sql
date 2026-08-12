-- Instant Attorney — Stage 48: persistent document partner conversations
-- Attorney-only work product, pinned to the exact working revision used for a
-- turn so a conversation can be audited even after a newer revision is made.
create table if not exists attorney_document_messages (
  id                   uuid default gen_random_uuid() primary key,
  document_id          uuid references documents(id) on delete cascade not null,
  case_file_id         uuid references case_files(id) on delete cascade not null,
  attorney_id          uuid references profiles(id) on delete cascade not null,
  -- Deliberately an identifier rather than a FK: the revision pipeline replaces
  -- second-draft rows, but its prior conversation must remain durable/auditable.
  working_revision_id  uuid not null,
  role                 text not null check (role in ('user', 'assistant')),
  content              text not null,
  -- Set only when the assistant proposed a complete replacement draft and it
  -- was applied. Ordinary analysis/questions never mutate the document.
  proposed_patch       text,
  patch_applied        boolean not null default false,
  created_at           timestamptz default now() not null
);

create index if not exists attorney_document_messages_thread_idx
  on attorney_document_messages
    (document_id, case_file_id, attorney_id, working_revision_id, created_at, id);

alter table attorney_document_messages enable row level security;

drop policy if exists "attorneys_manage_document_messages" on attorney_document_messages;
create policy "attorneys_manage_document_messages"
  on attorney_document_messages for all
  using (public.is_attorney() and attorney_id = auth.uid())
  with check (public.is_attorney() and attorney_id = auth.uid());
