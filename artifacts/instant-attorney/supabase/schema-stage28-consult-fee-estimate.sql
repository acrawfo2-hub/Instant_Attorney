-- Instant Attorney — Stage 28: Consult fee guidance draft
-- Run AFTER schema-stage27-document-deliveries.sql in the Supabase SQL editor

alter table consult_requests
  add column if not exists fee_estimate_draft jsonb;
