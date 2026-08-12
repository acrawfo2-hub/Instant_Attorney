# Consolidation: the plan, and what it is not

`ARCHITECTURE.md` says what owns what **today**. This says what is being removed
and in what order, so the sequence stops being re-derived — and re-argued — by
every session that opens the repo.

Source: `docs/simplification-audit-2026-08-12.md` (PR #139), read critically.
Most of it is adopted. Where it is not, the disagreement is recorded here rather
than left for someone to rediscover.

## The problem, stated once

The product kernel is sound. Document text has one persistence boundary, drafts
still complete when facts are missing, the Living File sync is durable, attorney
edits are proposed before they are accepted, and high-risk instruments refuse to
invent a jurisdiction. None of that is up for negotiation — see
**Guardrails** below.

The excess sits around that kernel: two client drafting experiences, two draft
records, four modules computing "what next," five attorney AI rooms, and a
roadmap subsystem that is a second case spine. Each was built by an agent that
could not see the others. Each passed its own tests.

## What survives — the acceptance tests

Everything must justify itself against these seven. Adopted from the audit
unchanged:

1. A user can start with an incomplete story and the AI patiently identifies
   what matters.
2. Every request to draft produces a complete, visible, editable artifact;
   unknown facts become unmistakable placeholders or deficiencies, never an
   abandoned draft.
3. A user can always find every current document and its status from the case
   workspace.
4. A user or authorized attorney can edit without losing history.
5. An attorney can converse with a case-aware junior associate, update the
   strategy, revise documents, and accept or reject proposed changes.
6. Every accepted fact, uploaded item, document revision, and attorney decision
   updates — or queues a durable update to — the Living File.
7. The system never invents governing law, authority, facts, or completion.

## Multi-case is not up for debate — it already works

The audit's phrase "make one case workspace the product" reads like one case per
client. **It does not mean that, and this is the correction that matters most.**
It means one workspace *design*, instantiated per matter. Its own target
vocabulary says "**Case** — stable matter identity," and all seven tests above
are case-scoped.

A client who wants a will, then a divorce, then a contract dispute is a first-
class case, and the schema has always supported it:

- `case_files.user_id` is one-to-many. Ten active matters per client.
- `documents`, `intake_messages`, `fact_items`, `attachments`,
  `client_workspace_drafts`, and every job table key off `case_file_id`, never
  off `user_id` alone.
- `components/MatterSwitcher.tsx`, `ResumeMatterBanner`, `lib/matter-switcher.ts`
  and the `/dashboard` grid already carry it in the UI.

Nothing in this plan collapses matters together. Consolidating *journeys* is not
consolidating *matters* — one drafting surface serves many cases, the way one
editor serves many files.

### The real multi-case defect

`app/api/chat-acp/route.ts` resolves a turn with no `caseFileId` by taking the
most recently opened file:

```
.eq("user_id", userId).eq("status", "open")
.order("opened_at", { ascending: false }).limit(1)
```

Most-recent-wins, silently. A client with an open will matter who opens `/chat`
and says "my wife filed for divorce" gets divorce facts extracted into the will's
Living File. No prompt, no error, and the extractor blends them.

This gets **worse** as journeys converge on one chat surface, so it is fixed
before that convergence, in chunk 3. The fix has the same shape as chunk 1's
document write boundary: matter routing becomes an owned, explicit decision with
no default.

- One `resolveMatter` seam. Every entry point goes through it.
- When the subject does not match the current matter, the orchestrator **asks**
  before it writes — "this sounds like a new matter; open a divorce file, or add
  it to your will?" — and opens a new `case_files` row on confirmation.
- It never guesses, and it never picks by recency.
- A guard test fails any code path that selects a case file by ordering on
  `opened_at`.

## The rule: every chunk ships its guard

Chunk 1's durable win was not merging the write paths. It was
`document-persistence.test.ts` scanning `app/` and `lib/` and failing on any
*new* writer, by name, with instructions. Consolidation without enforcement
regrows — that is the whole history of this codebase.

**A chunk that consolidates a capability and does not leave behind a test that
fails when the duplication returns is not finished.** Where the failure mode can
be deleted outright instead of guarded, prefer that: chunk 2 removed three
routing guards by removing the second service that made shadowing possible.

## Sequence

| # | Chunk | State |
|---|---|---|
| 0 | Write down the intent — `ARCHITECTURE.md`, `CLAUDE.md` | done |
| 1 | One write path for document text — `saveDocumentRevision` + writer guard | done |
| 2 | Delete the second architecture and the guardrail it required | done |
| 3 | One matter routing decision — fixes the defect above | next |
| 4 | One guidance result — `CaseGuidance`; retire the roadmap spine | |
| 5 | One drafting surface — orchestrator meets the completion contract | |
| 6 | One attorney workbench — one associate, one thread, one accept gate | |
| 7 | Remove the retired `pre_warmed` state | |

### Chunk 4 — one guidance result

`next-step.ts` (466), `mission-control.ts` (438), `file-deck.ts` (530) and the
now-deleted `case-cta.ts` all answered "where is this client and what do they do
next," and could disagree. Collapse to one `CaseGuidance` result — standing, one
recommended action, blockers, active jobs, documents awaiting someone. Several
components may render it; none may compute it.

The roadmap subsystem (25 `lib/*-roadmap*` modules, 10 components, 2 routes)
goes with it: it is a second spine answering the same question. Deterministic
legal sequencing worth keeping moves behind a consult-brief adapter.

*Deletion test:* if removing the roadmap panels does not prevent drafting,
document access, editing, submission, attorney review, or Living File updates, it
was not kernel.

### Chunk 5 — one drafting surface

`app/wizard/[type]/page.tsx` (1,354 lines) is a second drafting client competing
with the orchestrator. It retires once orchestrator drafting satisfies the
completion contract: create a visible shell synchronously, acknowledge, generate
durably, recover deterministically from truncation into an instrument-shaped
fallback, mark gaps as stable placeholders plus a deficiency list, persist
through the one boundary, open in the same editor regardless of origin, and never
disappear on failure.

> **`app/api/wizard/route.ts` is not the wizard.** It is the Generate stage of
> the pipeline and one of the declared document writers in `ARCHITECTURE.md`.
> The *journey* retires — the page and its inbound links. The engine, the
> instrument profiles, authority pinning, the generation spec, the risk gate,
> refinement, the validator, the renderers, and fallback completion all stay and
> become orchestrator-internal. Deleting the route deletes document generation.

### Chunk 7 — `pre_warmed`

A retired status that ~15 call sites must remember to filter out is permanent
accidental complexity. Every query that forgets shows the client a document that
does not exist. Inventory rows first, then remove the enum value and every
defensive filter together.

## Deferred, deliberately

**The case event contract and Living File projection** — the audit's slice 5,
its own "highest data risk," 2–3 weeks. This is event sourcing: an event table, a
case revision counter, idempotent projection, and every semantic writer
converted. It is the right long-term shape and the wrong next move. This
codebase's failure mode is precisely the large, architecturally-correct change
that compiles cleanly and quietly reverses decisions made in code the author
never read.

Do the cheap version first, in the chunk-1 shape: a test that scans `app/` and
`lib/` and fails on any *new* semantic `case_files` writer, with administrative
writes (title, legal hold, archive) declared and exempt. That makes the writer
set visible and bounded, which is most of the benefit, and it is a prerequisite
for the real thing anyway. Revisit event sourcing when a named requirement needs
it — not for elegance.

**Physically merging `client_workspace_drafts` into `documents`** — the audit's
slice 6, and it already says to decide this last. Expose both through one service
and one UI model in chunks 4–5 first. If a stable artifact ID has removed the
complexity, do not migrate for tidiness.

## Where this plan departs from the audit

- **`artifacts/api-server` was not dead.** The audit listed it as unused with no
  product role. It was deployed, owned the bare `/api` prefix in the proxy, and
  had a startup health probe — for one route. Owning `/api` is what made deleting
  it valuable, not incidental to it. *Always confirm deployment reality before
  believing an import graph.*
- **No telemetry gates.** The audit conditions several retirements on measured
  usage and proposes flag-and-observe cycles. The product is pre-launch with no
  users, so there is nothing to measure and nothing to break. These are judgment
  calls made on reversible Git history, and the observation windows are dropped.
- **Enforcement is mandatory, not implied.** See the rule above.
- **Slice 5 is deferred**, as argued above.

## Guardrails — never removed in the name of simplicity

These are complexity caused by real failure modes. Consolidation puts each in
**one** place; it does not delete any of them.

- the `saveDocumentRevision` boundary and durable Living File sync status;
- immutable document revision history;
- marker-completeness checks and recovery for truncated model output;
- placeholder/deficiency behavior, so an incomplete request never becomes no
  document;
- jurisdiction and authority gates for high-risk instruments;
- attorney propose-then-accept semantics, and QA against the *accepted* revision;
- ownership/role checks, RLS, audit trails, retention and legal-hold duties, and
  privileged-work-product boundaries;
- durable ACP/document jobs and their idempotency protections.
