-- Instant Attorney — Stage 54: support desk
-- Tickets are service-role only. A public/authenticated user submits through a
-- validated server endpoint and cannot enumerate or read support records.

create table if not exists support_tickets (
  id                 uuid primary key default gen_random_uuid(),
  ticket_number      bigint generated always as identity unique,
  user_id            uuid references profiles(id) on delete set null,
  requester_email    text not null,
  category           text not null check (category in ('login','password','account_access','billing','technical','other')),
  subject            text not null,
  description        text not null,
  page_path           text,
  status             text not null default 'new' check (status in ('new','in_progress','waiting','resolved','closed')),
  priority           text not null default 'normal' check (priority in ('urgent','high','normal','low')),
  assigned_admin_id  uuid,
  resolution_summary text,
  admin_notes        text,
  diagnostics        jsonb not null default '{}'::jsonb,
  first_response_at  timestamptz,
  resolved_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table support_tickets enable row level security;

create index if not exists support_tickets_queue_idx
  on support_tickets (status, priority, created_at desc)
  where status not in ('resolved', 'closed');
create index if not exists support_tickets_requester_idx
  on support_tickets (requester_email, created_at desc);
create index if not exists support_tickets_user_idx
  on support_tickets (user_id, created_at desc)
  where user_id is not null;

comment on table support_tickets is
  'Service-only IT/support work queue. Never store passwords, passcodes, or legal matter contents.';
