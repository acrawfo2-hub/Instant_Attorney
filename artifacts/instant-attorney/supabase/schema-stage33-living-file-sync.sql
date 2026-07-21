-- Instant Attorney — Stage 33: Living File background sync watermark
-- Run this in the Supabase SQL editor (production project).
--
-- Freestyle (and any turn where the conversational model doesn't emit a
-- ---LIVING FILE--- block) would otherwise leave facts stranded in the chat
-- transcript and never in the Living File. A background extractor now sweeps the
-- intake transcript and writes the file. This column is its watermark: the
-- created_at of the last intake message the extractor has already folded into
-- the file. Each sweep reads only messages newer than this, so it never
-- reprocesses (which would risk near-duplicate facts) and stays cheap.
--
-- Backward compatible & idempotent: existing rows get NULL, which the extractor
-- treats as "never synced — read the whole transcript." Until this column
-- exists the app degrades gracefully: the sync route swallows a missing-column
-- error and simply does not advance a watermark.

alter table case_files
  add column if not exists last_file_synced_at timestamptz;
