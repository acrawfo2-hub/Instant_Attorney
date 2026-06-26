-- Instant Attorney — Stage 29: Existing-counsel intake on case files
-- Run AFTER schema-stage28-consult-fee-estimate.sql in the Supabase SQL editor

alter table case_files
  add column if not exists counsel_intake_at timestamptz,
  add column if not exists has_existing_counsel boolean,
  add column if not exists existing_counsel_name text,
  add column if not exists counsel_engagement_goal text
    check (
      counsel_engagement_goal is null
      or counsel_engagement_goal in (
        'understand_situation',
        'document_review',
        'prepare_for_meeting',
        'second_opinion'
      )
    );
