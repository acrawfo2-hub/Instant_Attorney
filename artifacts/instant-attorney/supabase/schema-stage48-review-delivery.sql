-- Phase 3: attorney memo, editable delivery draft, and immutable sends.
create table if not exists document_delivery_drafts (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null unique,
  revision_document_id uuid references documents(id) on delete restrict not null,
  review_run_id uuid references document_review_runs(id) on delete set null,
  memo jsonb not null default '{}'::jsonb,
  recipient text not null,
  subject text not null,
  body text not null,
  consultation_url text,
  consultation_enabled boolean not null default true,
  updated_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists document_deliveries (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete restrict not null,
  revision_document_id uuid references documents(id) on delete restrict not null,
  case_file_id uuid references case_files(id) on delete restrict not null,
  user_id uuid references profiles(id) on delete restrict not null,
  sent_by uuid references profiles(id) on delete set null,
  recipient text not null,
  subject text not null,
  body text not null,
  consultation_url text,
  attachment_file_name text not null,
  sent_at timestamptz not null default now()
);

alter table document_delivery_drafts enable row level security;
alter table document_deliveries enable row level security;
create policy "attorneys_manage_delivery_drafts" on document_delivery_drafts for all using (public.is_attorney()) with check (public.is_attorney());
create policy "attorneys_manage_deliveries" on document_deliveries for all using (public.is_attorney()) with check (public.is_attorney());
create policy "clients_read_own_deliveries" on document_deliveries for select using (auth.uid() = user_id);
create index if not exists document_deliveries_case_idx on document_deliveries(case_file_id, sent_at);
