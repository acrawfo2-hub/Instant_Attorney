-- Instant Attorney — Stage 53: first-party, privacy-minimal marketing analytics
-- Service-role writes and admin reads only. No IP addresses, full referrers,
-- query strings, user agents, or page contents are collected.

create table if not exists analytics_page_views (
  id             bigint generated always as identity primary key,
  visitor_id     uuid not null,
  session_id     uuid not null,
  user_id        uuid references profiles(id) on delete set null,
  page_path      text not null check (page_path like '/%'),
  referrer_host  text,
  utm_source     text,
  utm_medium     text,
  utm_campaign   text,
  occurred_at    timestamptz not null default now()
);

alter table analytics_page_views enable row level security;

create index if not exists analytics_page_views_occurred_at_idx
  on analytics_page_views (occurred_at desc);
create index if not exists analytics_page_views_visitor_occurred_idx
  on analytics_page_views (visitor_id, occurred_at desc);
create index if not exists analytics_page_views_path_occurred_idx
  on analytics_page_views (page_path, occurred_at desc);
create index if not exists analytics_page_views_source_occurred_idx
  on analytics_page_views (utm_source, occurred_at desc)
  where utm_source is not null;

comment on table analytics_page_views is
  'First-party page analytics. Accessible only through server-side service-role code.';
