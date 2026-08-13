-- Stage 47: deterministic, serialized Living File synchronization.
-- The timestamp and UUID are one cursor; UUID breaks ties between messages that
-- receive the same database timestamp.  The lease row survives process crashes.

alter table case_files
  add column if not exists last_file_synced_message_id uuid
    references intake_messages(id) on delete set null;

create table if not exists living_file_sync_jobs (
  case_file_id uuid primary key references case_files(id) on delete cascade,
  lock_token uuid,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table living_file_sync_jobs enable row level security;

create or replace function acquire_living_file_sync(
  p_case_file_id uuid, p_lock_token uuid, p_lease_seconds integer default 300
) returns boolean language plpgsql security definer set search_path = public as $$
declare acquired boolean;
begin
  if not exists (select 1 from case_files c where c.id = p_case_file_id
    and (c.user_id = auth.uid() or auth.role() = 'service_role')) then return false; end if;
  insert into living_file_sync_jobs(case_file_id, lock_token, locked_until)
    values (p_case_file_id, p_lock_token, now() + make_interval(secs => p_lease_seconds))
  on conflict (case_file_id) do update set
    lock_token = excluded.lock_token, locked_until = excluded.locked_until, updated_at = now()
  where living_file_sync_jobs.locked_until is null or living_file_sync_jobs.locked_until < now();
  select lock_token = p_lock_token into acquired from living_file_sync_jobs
    where case_file_id = p_case_file_id;
  return coalesce(acquired, false);
end $$;

create or replace function release_living_file_sync(p_case_file_id uuid, p_lock_token uuid)
returns boolean language sql security definer set search_path = public as $$
  update living_file_sync_jobs set lock_token = null, locked_until = null, updated_at = now()
  where case_file_id = p_case_file_id and lock_token = p_lock_token returning true
$$;

-- Cursor compare-and-set and lease release occur in this function's transaction.
-- A stale worker can therefore neither overwrite a successor nor consume its window.
create or replace function advance_living_file_cursor(
  p_case_file_id uuid, p_lock_token uuid,
  p_expected_created_at timestamptz, p_expected_id uuid,
  p_new_created_at timestamptz, p_new_id uuid
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from living_file_sync_jobs where case_file_id = p_case_file_id
    and lock_token = p_lock_token and locked_until >= now()) then return false; end if;

  update case_files set last_file_synced_at = p_new_created_at,
    last_file_synced_message_id = p_new_id
  where id = p_case_file_id
    and last_file_synced_at is not distinct from p_expected_created_at
    and last_file_synced_message_id is not distinct from p_expected_id;
  if not found then return false; end if;

  update living_file_sync_jobs set lock_token = null, locked_until = null, updated_at = now()
    where case_file_id = p_case_file_id and lock_token = p_lock_token;
  return true;
end $$;

revoke all on function acquire_living_file_sync(uuid, uuid, integer) from public;
revoke all on function release_living_file_sync(uuid, uuid) from public;
revoke all on function advance_living_file_cursor(uuid, uuid, timestamptz, uuid, timestamptz, uuid) from public;
grant execute on function acquire_living_file_sync(uuid, uuid, integer) to authenticated, service_role;
grant execute on function release_living_file_sync(uuid, uuid) to authenticated, service_role;
grant execute on function advance_living_file_cursor(uuid, uuid, timestamptz, uuid, timestamptz, uuid) to authenticated, service_role;
