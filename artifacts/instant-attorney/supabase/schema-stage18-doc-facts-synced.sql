-- ── documents.facts_synced_at — track the file state a draft was generated against ──
-- When a client adds new information to their file (new facts, answered gaps, or
-- new What-If / hypothetical answers), any document drafted BEFORE that change is
-- now out of date. `updated_at` can't be used for this — it also moves on status
-- changes — so we record a dedicated timestamp set whenever the document is
-- generated or regenerated. A document is "out of date" when any of the case's
-- fact_items changed (created_at / updated_at) after this timestamp.
--
-- Backward compatible & idempotent: existing rows get NULL (treated app-side as
-- "not out of date", never as stale), so nothing is falsely flagged before a
-- regeneration stamps a value.
--
-- IMPORTANT (deploy): the live database must run this SQL. Until it is applied,
-- the app degrades gracefully — the generation routes stamp this column on a
-- best-effort basis (a missing column is swallowed, never failing a draft), and
-- the staleness check treats a missing/NULL value as "not out of date". The
-- "out of date" flag and per-document Regenerate action simply stay dormant
-- until the column exists.

alter table documents
  add column if not exists facts_synced_at timestamptz;
