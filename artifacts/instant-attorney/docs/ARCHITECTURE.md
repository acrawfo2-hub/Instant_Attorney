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
id and drives the durable Living File sync. `lib/document-persistence.test.ts`
asserts this and will fail if a route writes around it.

Consolidation of the remaining direct writers is in progress; see
"Known duplication" below. When you touch one, route it through the boundary
rather than adding a thirteenth path.

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

Tracked so nobody "fixes" it twice, and so nobody adds to it:

- **Document writes** — the boundary exists; several routes still write
  directly. Being migrated route by route.
- **`lib/document-generation-policy.ts`** — real rules (3-job cap, supersession)
  that nothing calls yet. Either wire it up or delete it; do not duplicate it.
- **`lib/case-cta.ts`** — orphaned. Nothing imports it.
- **`lib/document-revisions.ts`** — 18 lines; likely belongs inside the
  persistence boundary.
