-- Instant Attorney — Stage 22 Schema Additions
-- Run this AFTER schema-stage21-matter-archival.sql in the Supabase SQL editor.
--
-- Adds the notice-then-destroy step for end-of-retention destruction. An archive
-- becomes destruction-eligible at retention_until; the Firm first sends the
-- client a destruction notice (recording destruction_notice_sent_at) and only
-- securely destroys the stored object after the notice period elapses, unless a
-- legal hold applies. The manifest row is kept as a tombstone (destroyed_at set).

alter table matter_archives
  add column if not exists destruction_notice_sent_at timestamptz;
