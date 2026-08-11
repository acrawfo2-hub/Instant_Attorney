-- Instant Attorney — Stage 47: stable document instrument identity
-- Run after stage 46.

-- Titles and content_json are presentation/payload fields.  A first-class key
-- lets document reuse and execution rules continue to identify the same preset
-- after either field changes.
alter table public.documents
  add column if not exists instrument_key text;

update public.documents
set instrument_key = nullif(btrim(content_json->>'plan_key'), '')
where instrument_key is null
  and jsonb_typeof(content_json->'plan_key') = 'string';

alter table public.documents
  drop constraint if exists documents_instrument_key_not_blank;
alter table public.documents
  add constraint documents_instrument_key_not_blank
  check (instrument_key is null or btrim(instrument_key) <> '');

create index if not exists documents_instrument_key_lookup_idx
  on public.documents (case_file_id, user_id, instrument_key, updated_at desc)
  where instrument_key is not null and parent_document_id is null;

comment on column public.documents.instrument_key is
  'Stable instrument/preset identity. Titles and content_json may change without changing this key.';

-- Profiles are the FK root for documents and subscriptions. Repair any legacy
-- auth accounts that predate the signup trigger so the new document flow cannot
-- fail with a profiles foreign-key error.
insert into public.profiles (id, email, full_name, account_type, attorney_user_status)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  case when coalesce(u.raw_user_meta_data->>'account_type', 'client') = 'attorney_user'
       then 'attorney_user' else 'client' end,
  case when coalesce(u.raw_user_meta_data->>'account_type', 'client') = 'attorney_user'
       then 'pending' else null end
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null;
