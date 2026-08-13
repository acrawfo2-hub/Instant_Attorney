-- Drop the tables behind the two retired attorney AI rooms.
--
-- OPTIONAL, AND DESTRUCTIVE. Everything else in this directory either creates
-- something or repairs something; this is the only file that deletes data. It is
-- listed last in APPLY-ORDER.md and nothing depends on it having run.
--
-- The freestyle workspace and the case brainstorm were two of five attorney AI
-- rooms. Both were deleted in code — components, routes, prompts — because the
-- review workbench is the one place the attorney talks to the associate. No
-- code queries these three tables any more; `pnpm schema:strict` confirms it.
--
-- What is in them is attorney work product: internal strategy conversations and
-- freestyle drafts. Two reasons that cuts both ways, which is why this is your
-- decision and not a side effect of the code change:
--
--   * If those conversations have retention or legal-hold significance for any
--     matter, do NOT run this. Export them first, or leave the tables in place —
--     they cost nothing to keep and nothing reads them.
--   * If they are pre-launch test data, dropping them removes three tables, and
--     with them the temptation for a future agent to "reconnect" a room that was
--     retired deliberately.
--
-- Check before you run it:
--   select count(*) from attorney_workspace_messages;
--   select count(*) from case_brainstorm_messages;
--   select count(*) from attorney_workspace_drafts;
--
-- The two case_files columns below fed the "from your freestyle workspace"
-- digest on the attorney client page, which went with the room.

drop table if exists attorney_workspace_messages;
drop table if exists attorney_workspace_drafts;
drop table if exists case_brainstorm_messages;

alter table case_files
  drop column if exists attorney_workspace_summary,
  drop column if exists attorney_workspace_summarized_at;
