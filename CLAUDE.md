# Instant Attorney

The app lives in `artifacts/instant-attorney` (Next.js, Supabase). It is
deliberately outside the pnpm workspace and has its own `node_modules`, so run
its commands from that directory.

## Read this first

**`artifacts/instant-attorney/docs/ARCHITECTURE.md`** — what the product does,
which module owns each capability, and the rules that have already been broken
more than once. Read it before changing anything under `lib/` or `app/api/`.

**`artifacts/instant-attorney/docs/CONSOLIDATION.md`** — what is being removed,
in what order, and what was deliberately deferred. Read it before deleting or
merging anything: several duplications are scheduled, and removing one out of
order (or "helpfully" removing a deferred one) is its own kind of collision.
It also settles the question that keeps getting re-asked — **a client can have
many matters, that has always been true, and nothing in the plan changes it.**

The short version: this codebase was built by several agents working in parallel
from the same commit, none able to see the others' work. The result was three
PRs adding the same table with different columns, four PRs carrying back a fix a
newer PR had just made, and a dozen paths doing one job. Every one of them
passed its own tests.

So the rule is **one canonical implementation per capability**, and the question
to ask before opening a PR is not "does this work" but:

> **What does this change that already existed?**

If your branch is more than a few days behind `main`, rebase and re-read the
code you are changing. The dangerous changes here all compiled cleanly.

## Commands

Run from `artifacts/instant-attorney`:

```
pnpm typecheck        # tsc --noEmit
pnpm test             # node:test, ~824 tests
pnpm lint             # next lint
pnpm schema:strict    # migration/table collision guard — see below
pnpm build            # next build
```

CI runs all five. All must pass.

`pnpm lint` and `pnpm build` need `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` — `next.config.ts` requires them at config load.
See `.env.local.example`; placeholders are fine for both.

## The schema guard

`pnpm schema:strict` fails when two migrations create the same table with
different columns, or when code queries a table no migration defines. Both have
happened here. `create table if not exists` makes the second definition a silent
no-op, so the losing side writes to columns that were never created — invisible
to typecheck and to every unit test, since neither touches a real database.

Migrations are **not** applied automatically. See
`artifacts/instant-attorney/supabase/APPLY-ORDER.md`.

## Conventions

- Value imports in `lib/` carry an explicit `.ts` extension; the node test
  runner does not infer it. Type-only imports are erased and do not matter.
- Migrations are `supabase/schema-stageNN-<topic>.sql`. Several files may share
  a stage — that is the existing convention, not a mistake.
- `.mcp.json` is gitignored deliberately: MCP configs can carry auth tokens.
