-- Instant Attorney — Stage 5 Schema Additions
-- Run this AFTER schema-stage4.sql in the Supabase SQL editor

-- Track when a document was submitted for attorney review (48-hour SLA clock)
alter table documents add column if not exists submitted_at timestamptz;
