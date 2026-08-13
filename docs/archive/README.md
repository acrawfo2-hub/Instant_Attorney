# Archive

Superseded plans and finished experiments, kept because knowing what was
*decided against* is worth as much as knowing what was decided.

Nothing here is a requirement. If a document in this folder describes a future
you are about to build, read its disposition first — several of these propose
directions the codebase has since chosen not to take, and re-implementing one
recreates the parallel-architecture problem `docs/ARCHITECTURE.md` exists to
prevent.

## Superseded design documents

### `codebase-refactoring-report.md` (June 19, 2026)

The first full architecture review. **Superseded** by
`docs/simplification-audit-2026-08-12.md` and by
`artifacts/instant-attorney/docs/ARCHITECTURE.md`, which is now the canonical
statement of what owns what.

Its headline finding — that the monorepo held two parallel architectures, with
the real product self-contained in `artifacts/instant-attorney` and the
Express/Drizzle/OpenAPI stack beside it serving nothing — was correct and has
been executed. `artifacts/api-server`, `artifacts/mockup-sandbox`, and
`lib/{api-spec,api-zod,api-client-react,db}` were deleted in chunk 2. Its
remaining recommendations are either done or restated more precisely in the
August audit. Kept for the reasoning, not the plan.

### `orchestrator-migration-plan.md`

**Superseded** by the consolidation plan in
`artifacts/instant-attorney/docs/CONSOLIDATION.md`.

Status was "proposed, not yet started," and it was written against a commit the
codebase has moved well past. It and the August audit propose overlapping but
differently-sequenced routes to the same destination (one drafting surface, one
attorney workbench, converged draft stores). Two live plans for one migration is
how this repository got into trouble; the consolidation plan is the one that is
being executed. Its phase 3 — converging `client_workspace_drafts` and
`documents` — survives there as a deliberately *deferred* step.

### `roadmap-design-proposal.md`

**Decided against.** It proposed promoting the roadmap to the case file's spine.
The consolidation decided the opposite: the roadmap is a second navigation model
competing with Mission Control, next-step, and the file deck, all of which
already answer "where am I and what do I do next." One guidance result absorbs
it. Specialist roadmap sequencing may survive as an internal input to consult
briefs, but not as a client-facing spine.

### `orchestration-architecture-design.md`

**Deferred, not scheduled.** It proposed two structural investments — a case
ontology and a critic model. Status was "no code yet."

The consolidation reaches the same conclusion by a different route and puts both
behind prerequisites: a case event contract is its last and highest-risk step and
is explicitly deferred, and multiple AI critics are on its do-not-automate list
until there is a single accepted-revision gate. Revisit only after one artifact
lifecycle and one event boundary exist.

## Archived branches

### `perf-phase1-phase2-6625`

Preserves the **phase 1 + phase 2 performance experiments** from session 6625.
Not intended to merge to `main`.

- `961bcb0` — Phase 1: chat rendering, query projection, landing RSC
- `c955598` — Phase 2: conditional deep dives, history windowing, full living file

See [`perf-optimizations-6625.md`](./perf-optimizations-6625.md) for a full
summary, file list, and revisit checklist. Inspect locally with:

```bash
git diff main..archive/perf-phase1-phase2-6625
```

**Superseded by:** production prompt routing and token wins landed via
`claude/token-efficiency-deep-dive-9fp57r` (merged to `main` 2026-06-27). The
UI/RSC refactor from phase 1 was not merged.
