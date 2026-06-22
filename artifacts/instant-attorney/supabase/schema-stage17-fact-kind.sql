-- ── fact_items.kind — distinguish hypothetical "what-if" intentions from facts ──
-- The What-If Game captures the client's stated wishes for hypothetical "what if…"
-- scenarios (e.g. "if my brother can't serve, I'd want my sister as backup
-- guardian"). These are NOT asserted facts that have occurred — they are
-- contingency preferences. We tag them with kind='hypothetical' so the drafter
-- treats them as conditional intentions (backup clauses, contingency provisions)
-- rather than established facts, and so the file view can show them separately.
--
-- Backward compatible: existing rows default to 'fact'. Idempotent — safe to
-- re-run.
--
-- IMPORTANT (deploy): the live database must run this SQL. Until it is applied,
-- the What-If "save" path falls back to writing the answer as a plain fact (the
-- "kind" column is omitted), so a user's thinking is never lost. The app also
-- classifies any fact whose description starts with "What-if · " as hypothetical,
-- so the feature behaves correctly even before this migration is applied — the
-- column just makes the tag explicit and durable.

alter table fact_items
  add column if not exists kind text not null default 'fact';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fact_items_kind_check'
  ) then
    alter table fact_items
      add constraint fact_items_kind_check check (kind in ('fact', 'hypothetical'));
  end if;
end $$;
