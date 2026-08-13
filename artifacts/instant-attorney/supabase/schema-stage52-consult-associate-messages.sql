-- Instant Attorney — Stage 52: persistent consult associate conversations
-- Same workbench teammate as document review. Attorney-only work product.
-- The associate never sends wrap-up or ends the session; this table is the
-- thread, not a second consult store.

create table if not exists attorney_consult_messages (
  id                   uuid default gen_random_uuid() primary key,
  consult_request_id   uuid references consult_requests(id) on delete cascade not null,
  attorney_id          uuid references profiles(id) on delete cascade not null,
  role                 text not null check (role in ('user', 'assistant')),
  content              text not null,
  created_at           timestamptz default now() not null
);

create index if not exists attorney_consult_messages_thread_idx
  on attorney_consult_messages (consult_request_id, attorney_id, created_at, id);

alter table attorney_consult_messages enable row level security;

drop policy if exists "attorneys_manage_consult_messages" on attorney_consult_messages;
create policy "attorneys_manage_consult_messages"
  on attorney_consult_messages for all
  using (public.is_attorney() and attorney_id = auth.uid())
  with check (public.is_attorney() and attorney_id = auth.uid());
