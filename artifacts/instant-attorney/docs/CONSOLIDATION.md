# Consolidation: the plan, and what it is not

`ARCHITECTURE.md` says what owns what **today**. This says what is being removed
and in what order, so the sequence stops being re-derived — and re-argued — by
every session that opens the repo.

Source: `docs/simplification-audit-2026-08-12.md` (landed from PR #139), read
critically. Most of it is adopted. Where it is not, the disagreement is recorded
here rather than left for someone to rediscover.

The August 13 verification file in the same PR is **not** a verdict on current
`main`. It inspected commit `a7ee109` on a branch named `work` that is not in
this repository. Chunks 2–7 landed after that snapshot. The file is kept next to
the source audit with a superseded banner so it is not rediscovered as a to-do
list. Do not re-open its P0 findings.

## Parked, do not integrate yet

Attorney-side feature specs opened after consolidation. They stay as pull
requests until a named chunk in this document is ready for them — they are new
product work, not cleanup, and one of them conflicts with a decision already
shipped.

| PR | What | Why parked |
|---|---|---|
| [#142](https://github.com/acrawfo2-hub/Instant_Attorney/pull/142) | Junior associate workbench build plan | **Decision named (Phase 3):** keep apply-on-arrival; do not restore preview-then-confirm. Aggressive teammate + one approve with informed override. Do not merge this plan as written. |
| [#143](https://github.com/acrawfo2-hub/Instant_Attorney/pull/143) | Consult workflow build plan | New feature. Out of scope until leftover consolidation items are the next named chunk. |

## Closed without merging

Inspected once during Phase 0 branch hygiene, then the leftover remote branch
was deleted. GitHub keeps the closed PR.

| PR | What | Why the branch went |
|---|---|---|
| [#100](https://github.com/acrawfo2-hub/Instant_Attorney/pull/100) | Revisioned, dependency-aware workspace-draft generation | Closed 2026-08-12 during the merge wave. Superseded by the revisions model (`schema-stage46` / `schema-stage48`) and `draftInstrument`. |

Merged-PR leftover branches (the parallel-agent wave) were deleted in the same
pass. Open PR branches are left alone.

## Phase 1 — current `main`, verified 2026-08-13

This is the re-audit of **this tree**, at `d062367`, with dependencies
installed. It is a delta, not a third 700-line audit. The August 13
verification file's P0 list is scored below so it stops being re-opened.

**What ran** (from `artifacts/instant-attorney`):

| Check | Result |
|---|---|
| `pnpm typecheck` | pass |
| `pnpm test` | 809 pass, 0 fail |
| `pnpm schema:strict` | 90 table definitions OK |
| `pnpm lint` | pass (warnings only; none are new architecture) |

`pnpm build` was not re-run here. CI still requires it. The August 13 file's
excuse — "dependencies are not installed, so nothing could run" — does not
apply to this checkout.

**Size vs the August 12 audit snapshot** (same roots: `app`, `components`, `lib`):

| Measure | Aug 12 audit | This tree |
|---|---:|---:|
| TypeScript/TSX files | 590 | 546 |
| Lines | 90,134 | 82,937 |
| API route handlers | 130 | 118 |
| Unit-test files under `lib` | 120 | 116 |
| SQL files at the migration root | 75 | 79 |

Counts moved because chunks 2–7 deleted journeys, not because a rewrite
landed. SQL went up because later stages added tables and narrowed
constraints; that is expected.

Method: count callers, then read the guards that already pin them. Dead code
in this repo looks live. A comment is not evidence.

### North-star scores

Code-path existence plus the existing guards. Not a live-database proof, not a
human usability test.

| # | Test | Score | Why |
|---|---|---|---|
| 1 | Incomplete story, patient intake | **Held, latent split** | Durable ACP jobs and Living File extraction are in the one chat route. The UI hardcodes `mode: "freestyle"`. The route still gates orchestrator tools on `mode === "freestyle"`, so a stored or posted `"intake"` turn is a different, weaker assistant. The client should never see those words; internally they still change behavior. |
| 2 | Every draft request yields a complete, visible, editable artifact | **Held on generation; leftover job/shell gaps** | The worker, regenerate, and attorney-originated draft all call `draftInstrument`. Markerless and truncated output is not saved as a draft. An unknown forum becomes `FORUM_PLACEHOLDER` (BLOCKING), not a refusal. Remaining: `dispatchDocumentPlan` inserts jobs only — the editable shell is created when a worker *claims* the job, so a queued job has status and no artifact id; a failed generate leaves that shell empty; there is no deterministic outline fallback. Failure-and-retry was a deliberate trade against saving ungated text. |
| 3 | Find every current document from the case workspace | **Held as aggregation; two identities** | The file deck and document table read both `client_workspace_drafts` and `documents`. Promotion still creates a second row. Physical merge remains deferred. |
| 4 | Edit without losing history | **Held after promotion** | Canonical `documents.draft_text` writes go through `saveDocumentRevision`. Unpromoted workspace drafts update the same row; immutable history starts at promote. That is the deferred two-record design, not a new bug. |
| 5 | Case-aware junior associate | **Held as one review workbench** | Freestyle and brainstorm rooms are gone. `/attorney/review/[id]` is the associate. `chat-edit` still does not write — the review page applies the change set and autosaves through `/revision`. Consult pages remain separate one-shot generators, which chunk 6 kept on purpose. Analysis-only turns (a question that must not produce a fake edit) are the #142 product decision, not missing cleanup. |
| 6 | Living File updates on accepted inputs | **Held for chat and canonical document writes; not event-complete** | Chat parses inline blocks and runs the extractor sweep. `saveDocumentRevision` queues Living File sync. Workspace-draft generation writes `client_workspace_drafts.content` directly and does not call that boundary. The cheap `case_files` writer-set guard (prerequisite for the deferred event contract) has not been built. `living-file-boundary.test.ts` pins message-cursor watermarks, not the writer set. |
| 7 | Never invent forum, authority, facts, or completion | **Held on the drafting engine** | The August 13 "worker bypasses the pipeline" finding is false here. `document-drafting.test.ts` fails any file that assembles `buildDrafterSystemPrompt` outside the engine (`chat-edit` is the one allowed non-writer). `document-risk.test.ts` scans prompts for jurisdiction-defaulting language. `input_fact_revision` is stored on the job and never read before save — a stale-plan check that does not exist, not a second generator. |

### August 13 P0 list, against this tree

| Claim | Status |
|---|---|
| Worker is a raw Anthropic call that skips the legal pipeline | **Gone.** `lib/document-job-worker.ts` calls `draftInstrument`. |
| Wizard journey still live | **Gone.** No `app/wizard`. Guards mention it in the past tense. |
| Five attorney AI rooms | **Gone.** Freestyle and brainstorm deleted; review is the room. Consult generators stay. |
| Roadmap spine competing with next-step | **Gone as UI.** `roadmap-build.ts` remains because consult briefs use it — that is the internal-adapter disposition, not a ghost. |
| `pre_warmed` still in application code | **Gone** from `.ts`/`.tsx`. Historical SQL only. |
| `case-cta.ts` / `document-generation-policy.ts` orphans | **Gone.** |
| Unused `api-server` / mockup scaffold | **Gone.** `pnpm-workspace.yaml` records the deletion. |
| Two document systems | **Still true, deferred.** One logical service first; no physical merge. |
| Living File coverage is not event-complete | **Still true, deferred.** Cheap writer-set guard is the next move if anything is done here. |
| `input_fact_revision` unused at save | **Still true.** |
| Shell created at claim, not dispatch | **Still true.** |
| Intake/freestyle mode split | **Still true as code, hidden in the UI.** Tools are off unless the turn is posted as freestyle. |
| `lib/freestyle-drafts.ts` header still names `attorney_workspace_drafts` and `ATTORNEY_FREESTYLE_HEAD` | **Stale comment on a live module.** The parsers are used by client chat drafts. The rooms they name are gone. Do not resurrect the rooms to make the comment true. |

### Leftover list — the only cleanup still in front of product work

Do these serially. Do not open a parallel agent on more than one.

1. ~~**Collapse `ChatMode`.**~~ **Done (Phase 2).** Tools, pacing, and draft persistence are always on. `case_files.chat_mode` is no longer written. The column and `ChatMode` type stay (data change). `freestyle-drafts.ts` header no longer names the deleted rooms.
2. ~~**Job visibility without a second generator.**~~ **Done (Phase 2).** `dispatchDocumentPlan` inserts the empty `client_workspace_drafts` shell and attaches it before a worker claims the job. Status, list, and cancel read `document_generation_jobs` (the live table). Fail-and-retry is unchanged — ungated text is still not saved. An empty shell is a card in progress, not a ready document: promote still rejects empty drafts, and the panel copy says so.
3. ~~**Cheap Living File writer guard.**~~ **Done (Phase 2).** `lib/living-file-writers.test.ts` names every `case_files` mutator. Do not event-source.
4. ~~**Then, and only then, the #142 product decision.**~~ **Named (Phase 3).** Keep apply-on-arrival. The associate is an aggressive teammate: discuss **and** fix in the same turn. The client still sees nothing until one attorney Approve. A dirty file (unverified citations / open blocking QA) does not disable Approve — it forces one recorded reason (informed override, not a waiver). Specialists are existing review/QA services the associate may call; shortcut buttons are the same calls. Do **not** restore preview-then-confirm. #142's remaining workstreams (formatting uncertainty labels, etc.) stay parked except as they fit this loop.

### Calculators, inline in chat

The product question that sat next to leftover 1: can the orchestrator call the
right calculators at the right times, inline, persist the result to the file,
and does that fit this cleanup?

**Yes — it was already the tool loop; leftover 1 is what made it reachable.**
`lib/orchestrator-tools.ts` wraps the same deterministic functions the
specialist pages use (`run_means_test`, `estimate_child_support`,
`screen_pi_sol`, and the rest). The prompt says: call the tool, don't compute
in prose; after a calculator, **offer** `record_fact` ("Want me to save that to
your file?"), don't auto-save. Auto-writing a number the client has not
confirmed would invent a fact (north star 7). There is no `update_living_file`
shortcut. Specialist pages stay as optional deep-dives; do not delete them in
this pass.

Case chat always needs a tool-capable provider (Anthropic today). Grok
text-only intake on `/api/chat-acp` is gone with the mode split.

`workspace_draft_jobs` is an unread leftover table. Nothing in `app/` or `lib/`
writes it. Leave it; dropping tables is not this chunk.

Still deferred, unchanged: physical merge of `client_workspace_drafts` into
`documents`; the case-event/projection rewrite; volunteer-text cross-matter
contamination (routing no longer silently picks the wrong file; extraction of a
volunteered new matter into the current file is still possible).

Specialist calculator pages (`/family/*`, `/bankruptcy/*`, `/personal-injury/*`, …) and `/free-chat` still exist. They are not secretly a second drafting engine. Do not delete them as "ghosts" without a named owner.

## The problem, stated once

That paragraph below is the August 12 picture, kept so the chunks read as a
sequence rather than as unexplained history. Chunks 0–7 removed it. Leftovers
1–3 closed in Phase 2. Leftover 4 named in Phase 3: apply-on-arrival, one approve, informed override.

The product kernel is sound. Document text has one persistence boundary, drafts
still complete when facts are missing, the Living File sync is durable, the
attorney's working copy autosaves through one write path (undo is revision
history — chunk 6; this is no longer propose-then-click-each), and high-risk
instruments refuse to invent a jurisdiction. None of that is up for
negotiation — see **Guardrails** below.

The excess that *sat* around that kernel: two client drafting experiences, two
draft records, four modules computing "what next," five attorney AI rooms, and a
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
| 3 | One matter routing decision — fixes the defect above | done |
| 4 | Retire the roadmap spine; confirm the guidance chain | done |
| 5 | One drafting engine; wizard journey retired | done |
| 6 | One attorney workbench — one associate, edits that apply | done |
| 7 | Remove the retired `pre_warmed` state | done |

### Chunk 4 — what it turned out to be

Planned as "collapse four competing guidance engines into one `CaseGuidance`
result, and retire the roadmap spine." Half of that was right.

**The roadmap was a competing spine, and was already unreachable.** `RoadmapSpine`
had no importer; it was the only thing importing the other panels and the only
caller of both `/api/roadmap/*` routes. The dashboard still queried
`roadmap_snapshots` on every file load and passed an overlay `ClientFileView`
accepted, defaulted, and never read. Deleted, along with six other orphaned
components and the `/api/assess-matter` route that only one of them called. The
roadmap *lib* layer stays: `consult-brief.ts` and `consult-fee-estimate.ts` use
it for legal sequencing, which is the internal-adapter disposition the audit
proposed.

**The remaining "four engines" were one chain.** `next-step → mission-control →
matter-tasks → file-deck`, each layer consuming the one below, read by two
surfaces at different heights — the client deck and the attorney board. They
cannot disagree. No `CaseGuidance` rewrite was done, because there was no defect
that rewriting would fix, and replacing a working pipeline with a new abstraction
is the exact change this codebase keeps being damaged by. See "The guidance
chain" in `ARCHITECTURE.md`.

Two real defects surfaced while establishing that, and were fixed:

* the Document Review gate — "stays locked until the client has brought in a
  document" — was applied only to the attorney's board, not to the client task
  view it was written for;
* the attorney board was computed on every *client* file load, above the early
  return that discards it.

**The lesson, for the chunks still queued:** the audit's file-level counts marked
the right places to look and were wrong about what was there. Verify the
duplication before consolidating it. Twice now the honest finding has been "this
is already dead" or "this is already one thing," and both were cheaper and safer
outcomes than the rewrite that was planned.

### Chunk 5 — one drafting surface, and why it is not a deletion

Planned as: retire `app/wizard/[type]/page.tsx` (1,354 lines) as a second
drafting client, once orchestrator drafting satisfies the completion contract.

Investigation first, per the chunk-4 lesson. Two things came back that change the
work:

**1. The wizard journey is load-bearing.** Unlike the roadmap, it is thoroughly
reachable: six specialist pages link to it, `CaseDocumentsTable` uses it for
"Continue →" on a draft, and — decisively — `next-step.ts` and
`mission-control.ts` build wizard hrefs, so **the guidance chain's own hero
action points at it.** Retiring the journey means rewiring the primary CTA of
the client's main surface.

**2. Orchestrator drafting is a shadow pipeline, not a lesser one.**
`lib/document-job-worker.ts` runs the durable generation job. It does create the
draft shell before calling a model, which is the completion contract's first
step. But `generateJobText` is a direct Anthropic call with a one-sentence system
prompt, and it reaches **none** of the Generation stages `ARCHITECTURE.md`
declares:

| Stage | Module | Worker uses it |
|---|---|---|
| Identity | `lib/instruments/` | no |
| Authority | `instruments/authority.ts` | no |
| Spec | `document-generation-spec.ts` | no |
| Risk gate | `document-risk.ts` | **no — so it cannot block on an unknown forum** |
| Generate | `app/api/wizard/route.ts` | no — its own inline call |
| Refine | `document-refinement.ts` | no |
| Validate | `instruments/validator.ts` | no |

It also does not check the `---DRAFT READY---` markers, so a truncated response
is saved as a draft.

So the audit's framing inverts. Retiring the wizard journey today would not
consolidate two drafting paths onto the good one — it would leave the *only*
path that applies jurisdiction gating, authority pinning and validation
unreachable, and route every client to the one that skips them. **The wizard
journey cannot retire until the worker calls the real pipeline.** That is the
actual chunk 5, and it is a build, not a deletion.

Groundwork landed first, because the investigation surfaced live defects:

* the worker selected `category, fact_text, source_quote` from `fact_items`,
  which has `description, status, kind`. PostgREST rejects the whole select, so
  the query returned an error and no rows, `facts ?? []` turned that into an
  empty list, and **every document the worker produced was drafted with no facts
  at all.** Nothing threw.
* it called `messages.create` with `max_tokens: 8000`, the non-streaming form
  that `replit.md` records as throwing and surfacing as a 502.
* `subscriptions.consult_credits` is read by six call sites and created by no
  migration.

The guard is `schema:strict`, now extended from tables to **columns** — which is
what makes that first class of defect visible at all. Extending it required
fixing the guard itself: it dropped any column whose name begins with a
constraint keyword, so `check_type` was invisible on both `document_qa` tables.
A silently dropped column is worse than a noisy one, because collision detection
compares column sets — a column invisible in every definition can diverge
between two migrations without the guard ever seeing it.

> **`app/api/wizard/route.ts` is not the wizard.** It is the Generate stage of
> the pipeline and one of the declared document writers in `ARCHITECTURE.md`.
> The *journey* retires — the page and its inbound links. The engine, the
> instrument profiles, authority pinning, the generation spec, the risk gate,
> refinement, the validator, the renderers, and fallback completion all stay and
> become orchestrator-internal. Deleting the route deletes document generation.

### Chunk 7 — `pre_warmed` (done)

The inventory was already done and recorded. Stage 13 retired the feature in June
2026, promoted rows with draft text to `draft`, deleted the stranded
placeholders, and noted the result in the migration itself: *verified on the live
database 2026-06-19, remaining_pre_warmed = 0*. It deliberately left the CHECK
constraint permissive so it stayed re-runnable.

Leaving the state legal is what made it expensive. Nothing wrote it, but fifteen
call sites had to remember to filter it out — four list filters, an editability
branch, a status-badge map, the placeholder-fill lifecycle, and the wizard's
promote-on-update branch — and every query that forgot would show a client a
document that does not exist. All of it is gone, along with the `DocumentStatus`
union member.

Stage 49 narrows the constraint, which is what makes removing the code safe:
without it a future insert could reintroduce a row in a state nothing handles.
The two `apply_document_placeholder_revision` functions still carry a
`not in ('draft', 'pre_warmed')` clause; it is now unreachable rather than wrong,
and replacing a live function to delete a dead disjunct is more risk than the
disjunct is worth.

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


### Chunk 5, as built

`lib/document-drafting.ts` is now the one implementation of "produce legal
document text". `draftInstrument` runs identity, authority, spec, risk gate,
generation, refinement and validation; the wizard route keeps its conversation
handling, persistence and response shape, and the worker keeps its job lifecycle
and shell. Neither owns the drafting any more.

The wizard is the engine behind the orchestrator, not a place the client clicks
through to. The six specialist pages' "draft this" buttons now hand the request
to the case conversation with a seeded composer — `?ask=` suggests, the client
still presses send.

**What is deliberately still reachable:** `/wizard/[type]` for *continuing* an
existing document. `next-step`, `mission-control` and `CaseDocumentsTable` link
there with a `docId`. Those cannot move to chat yet, because the chat drafts
panel reads `client_workspace_drafts` and those rows live in `documents` — the
artifact convergence this plan defers. Creating a document by clicking through is
gone; editing one you already have is not, and will not be until there is one
artifact.


### Chunk 5, finished: the wizard is retired

Three implementations of document generation existed, not two. The third was
`app/api/documents/[id]/regenerate/route.ts`, which the first version of the
chunk-5 guard did not catch: that guard pinned the risk gate to one *caller*, so
a path that never called the gate at all passed it. `regenerate` ran its own
Anthropic call with no risk gate, no pinned authority, no spec, no validator —
and `extractDraftText(...) ?? fullResponse.trim()`, which promoted a markerless
response to renderable `draft_text`. It writes through `saveDocumentRevision`, so
that raw prose became a revision the client could submit for review. Folded into
`draftInstrument`, which fixes both violations at once.

The guard now looks for the **drafter prompt** rather than the gate: assembling
`buildDrafterSystemPrompt` into a model call means you are generating a document
and must go through the engine. Its allowlist has exactly one entry — `chat-edit`,
which proposes and never writes — and adding to that set is how a second
implementation gets back in.

**The forum gate no longer refuses.** It used to return `blocked` and the client
got nothing, which broke acceptance test #2. It now shapes the draft instead: the
model is told the forum is unestablished, forbidden from naming or implying one,
and required to write `FORUM_PLACEHOLDER` everywhere the forum would appear.
Because that placeholder says BLOCKING, `placeholderFields` marks it required and
the existing "information needed" form asks the client for it like any other
missing fact — no new screen, no new concept. Never defaulting a jurisdiction and
never abandoning a draft are both kept; the third option is to mark it.

**Retired:** `app/wizard/[type]/page.tsx`, `app/api/wizard/route.ts`,
`app/api/wizard/save-answers`, and — newly orphaned by their removal —
`resolveWizardDocumentTarget` and `DRAFTER_SYSTEM_PROMPT`. Every capability the
journey provided already had an orchestrator equivalent: drafting is the
conversation, "Improve My Draft" is `open_uploaded_document`, editing is the
drafts panel, submitting is `promote` (which calls `finalizeDocumentSubmission`,
so it queues for the attorney), and download, placeholder-filling and regeneration
were already reachable from the case file.

`CaseDocumentsTable`'s "Continue →" resolves a promoted document back to the
workspace draft it came from, via `promoted_document_id`, and opens that in the
panel the client already edits in. No copy, no second artifact, and it works
without the physical table merge this plan still defers.

**Kept:** the instrument taxonomy and the placeholder parser — the engine's
vocabulary, not the journey's. They kept the wizard's names for one more commit,
which turned out to matter: the name gave a dead `generateDocument` renderer
enough cover to survive a cleanup that claimed to have finished. Both have since
been renamed (`InstrumentType`, `lib/placeholder-parsing.ts`); see
`ARCHITECTURE.md` for the three names that deliberately did not move.

**What "retired" turned out to leave behind.** Chunk 5 deleted the wizard's
routes and page and called it done. It was not. Over three follow-up commits the
same retirement kept yielding survivors, each invisible to typecheck, lint and
every test:

| Found | Size | Why it survived |
|---|---|---|
| `generateDocument` + 7 per-instrument templates | ~700 lines | a dead export in a live module |
| `WIZARD_PROMPTS` + `wizardBase` | ~190 lines | interview script emitting a `---WIZARD COMPLETE---` marker no parser reads |
| the guided-checklist half of `placeholder-parsing.ts` | ~490 lines | 21 passing tests, all of them pointed at it |
| `lib/starter-fold.ts` | 55 lines + 9 tests | whole module, no importer |
| `lib/workspace-auth.ts` | 27 lines | orphaned by chunk 6's route deletions |

Roughly 1,500 lines, none of it reachable, all of it added by nobody — it was
simply never removed. **A test suite is not evidence that code is live.** The
placeholder module is the clearest case: 21 tests covered the dead half while the
four functions the live UI actually calls had almost none, so the suite was
large, green, and aimed at the wrong half of the file.

Both guards described in `ARCHITECTURE.md` exist because of this list.


### Chunk 6, as built

**Five attorney AI rooms became one.** AttorneyFreestyleChat and CaseBrainstormChat
are deleted with their routes, prompts and the whole `/api/attorney/workspace`
surface — which took out `attorney_workspace_drafts`, a fourth draft store. The
consult generators stay: they produce one-shot artifacts and are not rooms.
`/attorney/review/[id]` is the workbench.

**The associate's edits apply.** They used to stack as proposals needing a click
each. The review page now applies the change set on arrival and autosaves through
`/revision`, the one attorney write path, which already writes an immutable
revision per save. Changes whose passage moved fall back to the accept buttons
instead of being dropped. `chat-edit` still does not write — a second writer
would race the editor's autosave on the same text.

**A confidentiality leak, found while designing that.** The attorney's working
copy is a `second_draft` child carrying the client's `user_id`, and the download
route's ownership check is `doc.user_id !== userId` — so the client could
download it at any moment, mid-edit, and `CaseDocumentsTable` offered the link
outright at both render sites. The editor autosaves on every pause and on unload,
so this was continuous, not occasional. Now a 409 server-side and hidden links,
pinned by `work-product.test.ts`.

**Approve-then-send was already built.** `/approve` sets the status behind review
and QA gates; the delivery composer is separate and requires approval;
`delivered` means executed. Nothing to build — the fourth time this program's
verification step changed the answer.

**The file is readable without leaving the draft.** `ReviewCoverSheet` already
carried facts, gaps, deadlines, counsel, source files and the intake transcript,
but truncated facts at eight with "+N more in the Living File" — sending the
attorney to another page mid-revision to read one fact. The overflow now opens in
place.

**Attorney-originated drafts, built.** `POST /api/attorney/case-files/[id]/draft`
takes a document name and free-text instruction, runs `draftInstrument` and saves
through `saveDocumentRevision` — a way in, not a second engine — then drops the
attorney into the workbench where the associate, the file and the revision
history already are. It stays `status: "draft"` with `submitted_at` null, because
the attorney is the author and stamping it `pending_review` would put their own
draft in their own queue on a 48-hour clock. It is invisible to the client until
approved, on the same rule as the working copy.
