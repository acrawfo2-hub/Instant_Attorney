-- Stage 7: Consult requests (internal scheduling tool)

create table if not exists consult_requests (
  id               uuid default gen_random_uuid() primary key,
  user_id          uuid references profiles(id) on delete cascade not null,
  case_file_id     uuid references case_files(id) on delete set null,
  status           text not null default 'pending'
                   check (status in ('pending','confirmed','attorney_proposed','cancelled','completed')),
  proposed_times   jsonb not null default '[]'::jsonb,   -- array of 3 ISO timestamp strings
  confirmed_time   timestamptz,                           -- the agreed slot
  attorney_proposed_time timestamptz,                     -- if attorney counters
  client_phone     text,
  notes            text,
  created_at       timestamptz default now() not null,
  updated_at       timestamptz default now() not null
);

alter table consult_requests enable row level security;

-- Clients see and manage their own requests
create policy "clients_own_consults" on consult_requests
  for all using (auth.uid() = user_id);

-- Attorneys see all requests
create policy "attorneys_all_consults" on consult_requests
  for all using (
    exists (select 1 from profiles where id = auth.uid() and is_attorney = true)
  );
