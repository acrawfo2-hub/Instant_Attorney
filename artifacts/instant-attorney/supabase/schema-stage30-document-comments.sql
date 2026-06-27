-- Instant Attorney — Stage 30: attorney comments & concerns on a document
-- Run this in the Supabase SQL editor (production project).
--
-- A running list of private attorney notes attached to a parent document. The
-- attorney records concerns while reviewing, then triggers a second-draft
-- generation that folds the open (unresolved) comments into the existing
-- second-draft pipeline. These are attorney-only work product and are never
-- exposed to the client (no client SELECT policy).
create table if not exists document_comments (
  id            uuid default gen_random_uuid() primary key,
  document_id   uuid references documents(id) on delete cascade not null,
  author_id     uuid references profiles(id) on delete set null,
  body          text not null,
  resolved      boolean not null default false,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

create index if not exists document_comments_document_id_idx
  on document_comments (document_id, created_at);

alter table document_comments enable row level security;

-- Attorney-only: reuses the stage-11 public.is_attorney() SECURITY DEFINER
-- helper, which avoids the RLS recursion problem. No client policy by design —
-- these comments are private attorney work product.
drop policy if exists "attorneys_manage_document_comments" on document_comments;
create policy "attorneys_manage_document_comments"
  on document_comments for all using (public.is_attorney()) with check (public.is_attorney());
