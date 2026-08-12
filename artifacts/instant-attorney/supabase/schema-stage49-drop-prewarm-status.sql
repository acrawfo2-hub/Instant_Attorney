-- Finish retiring the document "pre_warmed" status, by narrowing the constraint.
--
-- Stage 3 widened documents.status to allow 'pre_warmed'. Stage 13 retired the
-- feature and cleaned the data — promoting rows that had draft text to 'draft',
-- deleting the stranded placeholders — but deliberately left the CHECK
-- permissive so it stayed re-runnable and any in-flight legacy code would not
-- error. Its own note records the result: verified on the live database
-- 2026-06-19, remaining_pre_warmed = 0.
--
-- Leaving the state legal for three years of migrations is what made it
-- expensive. Nothing wrote it, but roughly fifteen call sites had to REMEMBER to
-- filter it out — four list filters, an editability branch, a status-badge map,
-- a placeholder-fill lifecycle, and the wizard's promote-on-update branch. Every
-- query that forgot would show a client a document that does not exist. That is
-- permanent accidental complexity: the cost is paid by every future reader, not
-- by the feature that caused it.
--
-- The application code for it is gone as of this change. Narrowing the
-- constraint is what makes that safe: without it, a future insert could
-- reintroduce a row in a state no code handles any more.
--
-- Re-runnable. If this fails, a row is still in the retired state — stage 13 did
-- not run against this database. Run its steps 1) and 2) first, then this.

alter table documents
  drop constraint if exists documents_status_check;

alter table documents
  add constraint documents_status_check
  check (status in ('draft', 'pending_review', 'approved', 'changes_requested', 'delivered'));

-- Verification — MUST return 0 rows.
--   select count(*) from documents where status = 'pre_warmed';
--
-- Note: apply_document_placeholder_revision (stages 46 and 48) still reads
-- `d.status not in ('draft', 'pre_warmed')`. That disjunct is now unreachable
-- rather than wrong, so those functions are left alone: replacing a live
-- function to delete a dead clause is more risk than the clause is worth.
