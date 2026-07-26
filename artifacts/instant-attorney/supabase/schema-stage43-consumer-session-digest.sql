-- Instant Attorney — Stage 43: Consumer freestyle "organize on leave" digest
-- Run this in the Supabase SQL editor (production project).
--
-- The consumer already flushes the Living File on leave (sendBeacon →
-- /api/chat-acp/sync-file forces syncLivingFile). This adds the "organize" half,
-- matching the attorney workspace: when the client leaves a freestyle session, a
-- short plain-language recap of what was covered and what's next is distilled and
-- stored here, then shown on their Living File when they return.

alter table case_files
  add column if not exists chat_session_summary text;
alter table case_files
  add column if not exists chat_session_summarized_at timestamptz;
