# Architecture: what this product is, and where each thing lives

Read this before opening a pull request. It exists because this codebase was
built by several AI agents working in parallel from the same commit, none able
to see the others' work. That produced real damage — three separate PRs tried to
make the same route write documents, four carried back a fix a newer PR had just
made, and three created the same database table with incompatible columns. Every
one of them passed its own tests.

The rule that prevents all of it: **one canonical implementation per
capability**. If you are about to add a second module that does what an existing
one already does, you are about to recreate the problem.

## What the product does

An AI chatbot that questions a client the way an excellent intake attorney
would, and from those answers:

1. **Intake** — asks the legal questions that matter, in a sensible order.
2. **Generation** — produces one or more documents from what it learned.
3. **Findability** — those documents stay easy to find and edit, always.
4. **Attorney review** — hands them to the attorney, who can still find and
   edit them easily, then resolves the matter or schedules a consult.
5. **Living File** — a cover sheet explaining the client's situation to them,
   updated on every input.

Findability and editability are not features among others. They are the point:
a document the client cannot locate or change has failed, however well drafted.

## The five capabilities and who owns them

### 1. Intake

| | |
|---|---|
| Entry point | `app/api/chat-acp/route.ts` |
| Tools | `lib/orchestrator-tools.ts` |
| Prompts | `lib/prompts.ts` |
| Jobs | `lib/acp-jobs.ts` — durable, survives a restart |

Generation is **not** done here. When a client asks for documents, this route
commits a bounded plan (`lib/document-plan.ts`) and tells them drafting has
started; the worker produces the text. Do not emit full document text into the
conversation — that rule is load-bearing and has been reverted once already.

### 2. Generation

A pipeline, in order. Each stage has one module:

| Stage | Module | Answers |
|---|---|---|
| Plan | `lib/document-plan.ts` | which documents, in what order |
| Identity | `lib/instruments/` | what instrument this is, what it must contain |
| Authority | `lib/instruments/authority.ts` | which pinned legal source backs it |
| Spec | `lib/document-generation-spec.ts` | what sections it needs |
| Risk gate | `lib/document-risk.ts` | is the governing forum known |
| Generate | `app/api/wizard/route.ts` | produce the text |
| Refine | `lib/document-refinement.ts` | structured sections |
| Validate | `lib/instruments/validator.ts` | is it ready for review |
| Render | `lib/doc-generator.ts`, `lib/doc-layout.ts` | produce the .docx |

Two rules learned the hard way:

- **Never default a jurisdiction.** High-risk instruments block when the
  governing forum is unknown rather than assuming one. Removing that block has
  been attempted twice.
- **A markerless model response is not a draft.** If the complete
  `---DRAFT READY---`/`---END DRAFT---` block did not arrive, the output is
  recovery material, not renderable text a client can submit for review.

### 3. Findability — the document write path

**`lib/document-persistence.ts` is the single boundary for writing document
text.** Every save goes through `saveDocumentRevision`, which stamps a revision
id and drives the durable Living File sync.

There are nine writers and no others:

| Writer | Save |
|---|---|
| `app/api/wizard/route.ts` | first generation |
| `app/api/documents/[id]/regenerate/route.ts` | regeneration in place |
| `app/api/documents/[id]/fill-info/route.ts` | client fills placeholders |
| `app/api/workspace/drafts/[id]/route.ts` | client edits a promoted draft |
| `app/api/workspace/drafts/[id]/promote/route.ts` | promotion and resubmission |
| `app/api/attorney/documents/[id]/revision/route.ts` | attorney accepts an edit |
| `app/api/attorney/documents/[id]/revisions/route.ts` | attorney restores a revision |
| `.../improvements/[improvementId]/route.ts` | attorney accepts a finding |
| `lib/document-utils.ts` | the second-draft child, for both its callers |

`lib/document-persistence.test.ts` enforces two things: each writer above calls
the boundary, and **no other file in `app/` or `lib/` writes document text at
all**. Adding a tenth write path fails the suite with instructions. If a new
file legitimately mentions `draft_text` without writing it, record why in that
test's `notDocumentWrites` map.

When a row already holds the text — the caller wrote it for other reasons — pass
a pass-through `persist: async () => documentId`. The boundary is then supplying
the revision id and the sync, not a second write.

Two different things are called a "revision". Do not conflate them:

| | |
|---|---|
| `document_revisions` | immutable content history — provenance, branching, append-only |
| `documents.current_revision_id` | a sync marker for Living File idempotency. Not a foreign key |

### 4. Attorney review

| | |
|---|---|
| Orchestrator | `lib/attorney-review.ts` |
| QA checks | `lib/attorney-review-qa.ts` |
| Authorities gate | `lib/attorney-review-authorities.ts` |
| Workbench UI | `app/attorney/review/[id]/page.tsx` |

The model here is **propose, then accept**. `chat-edit` returns proposed
changes; it never writes the document. The write happens when the attorney
accepts, in `app/api/attorney/documents/[id]/revision/route.ts`. Three separate
PRs have tried to make `chat-edit` write directly — if you find yourself adding
a document update there, stop.

QA verifies the revision the attorney actually accepted, never a regenerated
draft. Verifying an auto-rewrite certifies text nobody approved.

### 5. Living File

| | |
|---|---|
| Parse and apply | `lib/file-parser.ts` |
| Extract | `lib/living-file-extractor.ts` |
| Ordering | `lib/message-cursor.ts` — sync at message boundaries |

Updated on every input, as the product promises. The client-facing surface is
the case memo and the tile map in `components/ClientFileView.tsx`.

## The guidance chain — "what should this client do next?"

One chain answers it. Each layer consumes the one below, so they cannot
disagree:

```
lib/next-step.ts        computeNextStep         the hero action
  ↓                     mission-control is its only caller
lib/mission-control.ts  computeMissionControl   the ranked board
  ↓                     matter-tasks wraps the board
lib/matter-tasks.ts     buildMatterTasks        doable-now / blocked buckets
  ↓                     file-deck ranks the tasks
lib/file-deck.ts        buildFileDeck           tiles, pressing deadline, memo
```

Two surfaces read it at different heights, because they serve different people:

| Reader | Enters at | Renders |
|---|---|---|
| client — `ClientFileView`, and the chat rail via `/api/case-files/[id]/deck` | `buildFileDeck` | tiles, case hub, memo |
| attorney — `ClientFileView`'s second layout | `computeMissionControl` | `MissionControlBoard` |

That is one engine with two presentations, which is the target shape. **It was
not rewritten into a `CaseGuidance` result**, because there was no defect to fix
by doing so — the consolidation audit had read these as four peers that could
disagree. Two of the four were real and are gone: `case-cta.ts` was orphaned
(deleted in chunk 2), and the roadmap was a genuinely competing spine that turned
out to be unreachable (deleted in chunk 4a). What remained was already a
pipeline. Rewriting a working pipeline for the shape of it is the change this
codebase keeps being damaged by.

`guidance-chain.test.ts` pins two things: `computeNextStep` has exactly one
caller, so a new surface cannot grow a second opinion about the next action; and
no layer imports one above it, so the chain only ever reaches downward.

## Which matter — the routing decision

**`lib/matter-routing.ts` decides which `case_files` row a piece of work belongs
to, and it is the only thing that decides.**

A client can have many matters at once. That has always been true — `user_id` is
one-to-many, ten active per client, and every document, message, fact,
attachment and job keys off `case_file_id`. What was missing was an owner for
"which one is this?", so `chat-acp` answered it by taking the most recently
opened file. A client with an open will matter who pressed the dashboard's own
"Start another case" button was attached to the will — the button did the
opposite of its label — and everything they said about the new problem was
extracted into the wrong Living File.

There is no default now:

| Caller | Result |
|---|---|
| passes `caseFileId` | that matter, after ownership is verified |
| passes nothing | a **new** matter |

Bare `/chat` means *new*, because every resume path in the UI passes an id —
`/dashboard/[id]`, the case cards, the attorney client list, the drafts table.
Ownership is checked here rather than left to RLS: RLS refuses by returning no
rows, which reads downstream as "a matter with no facts" rather than as a
refusal.

`matter-routing.test.ts` fails any file in `app/`, `lib/` or `components/` that
pairs `order("opened_at")` with `limit(1)` — the signature of picking a working
matter by recency. Listing matters for the switcher orders the same way but
takes all of them, which is why the pair is what the guard looks for. Do not add
a file to an allowlist to make it pass.

The client's second matter is also a product action, not just navigation: the
`open_new_matter` orchestrator tool opens a separate file when the client
confirms one is warranted. Like `record_fact`, it must **ask first** — and it
must ask *before* exploring the new problem, because anything said first lands
in the current file.

> **Known gap.** Asking early is prompt guidance, not an enforced boundary. If
> the client volunteers a paragraph about the new matter before the assistant
> can ask, `parseAndUpdateFile` still extracts it into the current file. Closing
> that needs the case-event boundary in `CONSOLIDATION.md`, which is
> deliberately deferred. The routing seam and the tool remove the silent,
> systematic version of this bug; they do not make cross-matter contamination
> impossible.

## Database

Migrations live in `supabase/`, named `schema-stageNN-<topic>.sql`. Several
files may share a stage; that is the existing convention, not a mistake.

**`npm run schema:strict` gates CI.** It fails when two migrations create the
same table with different columns, or when code queries a table no migration
creates. Both have happened. `create table if not exists` makes the second
definition a silent no-op, so the losing side's code writes to columns that were
never created — invisible to typecheck and to every unit test, because nothing
in either touches a real database.

Migrations are not applied automatically. See `supabase/APPLY-ORDER.md`.

## Before you open a pull request

CI runs typecheck, unit tests, lint, build, and the schema guard. All must pass.

Then ask the question that catches the failure mode this codebase is prone to:

> **What does this change that already existed?**

Not "does it work" — every dangerous change here worked. The damaging ones
compiled cleanly, passed their tests, and quietly reversed a decision made in a
PR the author had never seen. If your branch is more than a few days behind
`main`, rebase and re-read the code you are changing before assuming your
version is the current one.

## Known duplication, being consolidated

Tracked so nobody "fixes" it twice, and so nobody adds to it. The order of
removal and the reasoning behind it are in **`CONSOLIDATION.md`** — read that
before starting on any entry here.

- ~~Four modules compute "what next"~~ — **investigated and not true.** See
  "The guidance chain" below. The two real problems it described are gone.
- **Two client drafting journeys** — `app/wizard/[type]/page.tsx` and the
  orchestrator. The *page* retires; `app/api/wizard/route.ts` is the generation
  engine and stays. See CONSOLIDATION.md before touching either.
- **Two draft records** — `client_workspace_drafts` and `documents`, bridged by
  promotion. One service and one UI model first; a physical merge only if that
  does not already remove the complexity.
- **Five attorney AI rooms** — general chat, freestyle workspace, document
  partner chat, brainstorm, consult tools. Fragmented context defeats the
  junior-associate goal. Combining into one case workbench.
- **`pre_warmed`** — a retired document status that ~15 call sites must remember
  to filter out. Every query that forgets shows a document that does not exist.

Removed in chunk 2, recorded so they are not recreated: `lib/case-cta.ts` and
`lib/document-generation-policy.ts` (both imported only by their own tests), and
`lib/document-revisions.ts` (folded into `document-persistence.ts`, where
revision policy now lives beside the write it governs).
