-- ── Link attachments to the chat message they were sent with ────────────────
-- Screenshots dropped into the Phase II intake chat are uploaded as attachments
-- (storage + an `attachments` row) and analyzed into the Living File. Until now
-- there was no link back to the specific `intake_messages` row the screenshot was
-- attached to, so when the chat is reloaded the conversation could be rebuilt from
-- intake_messages (text only) but the image could not be placed back into the
-- correct message bubble.
--
-- This migration adds a nullable `message_id` FK on `attachments`. It is set when
-- a screenshot is uploaded through the chat (see app/api/chat-acp/route.ts). It is
-- left NULL for attachments uploaded outside a chat turn (e.g. the dashboard
-- "Upload Documents" panel), which have no originating message — those continue to
-- surface only in the Living File / attachment panel, exactly as before.
--
-- on delete cascade: if a message is ever deleted, its inline screenshot record
-- goes with it (the case_file_id FK already cascades on case deletion).
--
-- Behavior impact: additive and nullable, so existing rows and all existing
-- queries are unaffected. Idempotent — safe to re-run.

alter table attachments
  add column if not exists message_id uuid references intake_messages(id) on delete cascade;

create index if not exists attachments_message_id_idx
  on attachments (message_id)
  where message_id is not null;
