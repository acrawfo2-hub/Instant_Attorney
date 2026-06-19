-- ── Retire the document "pre_warmed" status ─────────────────────────────────
-- Pre-warm (background pre-generation of drafts before the client opened the
-- wizard) was removed: it was brittle on an ephemeral server (severed background
-- jobs left rows stranded with no draft_text) and the live "compose on open +
-- answer questions in parallel" flow makes it unnecessary.
--
-- This migration cleans up any rows left in the retired state. It is idempotent.

-- 1) Promote any pre-warmed row that actually finished (has draft text) to a
--    normal draft so the client can find and continue it.
update documents
  set status = 'draft',
      updated_at = now()
  where status = 'pre_warmed'
    and draft_text is not null
    and length(trim(draft_text)) > 0;

-- 2) Delete pre-warmed placeholders that never produced a draft — these are the
--    stranded background jobs the new flow no longer creates.
delete from documents
  where status = 'pre_warmed'
    and (draft_text is null or length(trim(draft_text)) = 0);

-- Note: the status CHECK constraint is intentionally left permissive (it still
-- allows 'pre_warmed') so this migration is safe to re-run and so any in-flight
-- legacy code does not error. The application no longer writes that status.
