# Instant Attorney Simplification Audit

**Date:** August 12, 2026  
**Scope:** Current repository, with primary emphasis on `artifacts/instant-attorney`  
**Method:** Musk's five-step sequence—question, delete, simplify, accelerate, automate  
**Deliverable type:** Architecture and product audit only. No application code was changed.

---

## Executive decision

You have built most of the intended product, but you have also built several competing ways to reach it.

The code is not random spaghetti. The important invariants are unusually thoughtful: document text now has one persistence boundary; a draft must still be completed when facts are missing; the Living File is durably synchronized; attorney edits are proposed before they are accepted; and high-risk documents do not silently assume a jurisdiction. Those are the bones of the product and should remain.

The excess complexity sits around that kernel:

- two client drafting experiences (the guided wizard and orchestrator workspace drafts);
- two draft records before and after promotion (`client_workspace_drafts` and `documents`);
- multiple client guidance systems (next step, Mission Control, file deck, roadmap, and specialist pages);
- several attorney AI rooms (general chat, freestyle workspace, document partner chat, brainstorm, and consult tools);
- a large unused monorepo scaffold beside the actual application;
- legacy states and proposed policies that remain in code after their feature was retired or never connected;
- semantic Living File changes entering through several workflows rather than one case-update boundary.

**Recommendation:** Make one case workspace the product. Put one patient orchestrator in it. Give that orchestrator one living case model, one editable-draft lifecycle, and one attorney-review lifecycle. Keep specialist legal reasoning behind the orchestrator as tools; stop presenting each tool as its own product journey.

This is a consolidation program, not a rewrite. The safest sequence is to remove unreachable and unused code first, collapse visible journeys second, and only then consolidate database representations.

### The product in one sentence

> One case workspace in which a patient AI maintains a living case file, always finishes an editable document with conspicuous gaps when necessary, and hands the same file, documents, and conversation context to an attorney who can revise both strategy and work product.

### North-star acceptance tests

These are the requirements that survive the audit:

1. A user can start with an incomplete story and the AI patiently identifies what matters.
2. Every request to draft produces a complete, visible, editable artifact; unknown facts become unmistakable placeholders or deficiencies, never an abandoned draft.
3. A user can always find every current document and its status from the case workspace.
4. A user or authorized attorney can edit without losing history.
5. An attorney can converse with a case-aware junior associate, update the strategy, revise documents, and accept or reject proposed changes.
6. Every accepted fact, uploaded item, document revision, and attorney decision updates—or queues a durable update to—the Living File.
7. The system never invents governing law, authority, facts, or completion.

Everything else must justify itself against these seven outcomes.

---

## What was inspected

This was a static repository audit, not a production-data or live-Supabase audit. It included:

- all application routes, components, domain modules, tests, SQL migrations, and current architecture notes;
- import/reference searches for candidate dead code and parallel subsystems;
- searches for authentication, privileged clients, AI entry points, document writes, Living File writes, wizard links, roadmap implementations, and legacy states;
- current Git history, which shows that document persistence and architectural ownership were consolidated immediately before this audit;
- attempted type, schema, and unit checks. They could not start because the application-local dependencies are absent in this checkout.

### Current size snapshot

| Measure | Observed |
|---|---:|
| TypeScript/TSX files in `app`, `components`, and `lib` | 590 |
| Lines across those files | 90,134 |
| API route handlers | 130 |
| Unit-test files under `lib` | 120 |
| SQL files at the Supabase migration root | 75 |
| API routes containing `getUser()` | 84 |
| API routes creating a service client | 96 |
| Source files mentioning the `documents` table | 41 |

Counts do not prove poor design. They show the cost of every additional concept: 130 routes and 75 migrations make duplicated ideas expensive to detect, secure, test, and remove.

### Largest concentration points

| File | Lines | Audit interpretation |
|---|---:|---|
| `lib/prompts.ts` | 1,764 | Multiple personas and workflows share one policy surface; contradictions become hard to see. |
| `app/chat/page.tsx` | 1,417 | Conversation, uploads, jobs, drafts, layout, and recovery are one UI unit. |
| `app/wizard/[type]/page.tsx` | 1,354 | A second full drafting client exists beside the chatbot workspace. |
| `app/attorney/review/[id]/page.tsx` | 1,187 | The intended attorney workbook exists, but too many responsibilities remain page-local. |
| `lib/types.ts` | 996 | A single broad vocabulary records the accumulation of subsystems and legacy states. |
| `lib/orchestrator-tools.ts` | 964 | The right architectural direction, but it overlaps older direct journeys. |
| `components/CaseDocumentsTable.tsx` | 872 | One table is absorbing documents, workspace drafts, inline editing, review, and navigation. |
| `app/api/chat-acp/route.ts` | 854 | One canonical intake route still branches between old intake and freestyle behavior. |

---

## Step 1 — Question every requirement

### Ownership problem

Repository documents repeatedly contain “decision needed,” “proposed,” “draft,” and deferred phases. Code cannot tell us which human still wants each idea. Under the named-owner rule, **Andrew/product owner is the provisional owner only for the seven north-star requirements above**. Every additional requirement needs a named human who will defend its user value and accept its maintenance cost.

Use this register before any consolidation PR. A blank owner means “delete candidate,” not “ask the department.”

| Purported requirement | Provisional owner | Question that must be answered | Default decision |
|---|---|---|---|
| One case-aware, patient orchestrator | Andrew | Is this the single primary interface for clients and attorneys? | **Keep** |
| Always finish requested documents | Andrew | Does “finish” allow explicit placeholders and deficiency flags? | **Keep; answer should be yes** |
| Living File updated on every meaningful input | Andrew | Which events are meaningful, and what is the maximum acceptable sync delay? | **Keep; define an event contract** |
| Guided wizard as a separate user journey | **Unassigned** | What does it accomplish that orchestrator drafting plus inline gap collection cannot? | **Retire journey** |
| Client “intake mode” separate from freestyle | **Unassigned** | Does a user understand or benefit from this mode distinction? | **Combine** |
| Workspace drafts separate from documents | **Unassigned** | Is separate storage required for privilege, access, or retention—not merely history? | **Combine lifecycle; delay physical table merge** |
| Roadmap as a second case spine | **Unassigned** | Is it materially different from Mission Control/next action? | **Delete client-facing duplicate** |
| Specialist calculator/assessment pages | **Unassigned per tool** | Is there usage, a legal owner, and a unique decision produced? | **Hide/delete unless individually proven** |
| Free unauthenticated chat | **Unassigned** | Does it convert enough users to justify a separate unpersisted AI product and cost surface? | **Measure, then keep or replace with a constrained demo** |
| Multiple attorney chat rooms | **Unassigned** | Why should the attorney choose among general chat, freestyle, brainstorm, consult, and review partner? | **Combine into case workbench** |
| Dual AI-provider preference | **Unassigned** | Is this a user benefit or infrastructure experiment? Who owns output parity? | **Remove from user surface until parity is proven** |
| Monorepo API/Drizzle/generated-client scaffold | **Unassigned** | What deployed request uses it today? | **Delete** |
| Admin repair framework phases 3–4 | **Unassigned** | Which observed incident requires each proposed repair? | **Do not build** |
| Proactive generation policy | **Unassigned** | Will proactive generation ship now and use this exact policy? | **Wire now or delete now; no dormant policy** |
| Legacy `pre_warmed` document state | **Unassigned** | What live row still requires it? | **Migrate data, then delete** |

### Requirements that are currently too vague

1. **“Updated on every input.”** A keystroke is an input; an uploaded file, accepted fact, generated revision, attorney instruction, or consult outcome is a domain event. Define the latter list and make each event durably enqueue one case refresh. Do not promise synchronous semantic rewriting after every HTTP request.
2. **“All knowing for the client's case.”** Replace this with “can retrieve every authorized source item, distinguishes fact from assertion and opinion, exposes missing evidence, and states when context is unavailable.” “All knowing” encourages confident fabrication.
3. **“Complete a document.”** Define complete as structurally complete and editable, with stable placeholder tokens and a deficiency list. It does not mean filing-ready or fact-complete.
4. **“Can send to the attorney.”** Define a state transition with immutable revision identity, timestamp, sender, and attorney queue visibility. Avoid email delivery being the definition of submission.
5. **“Workbook.”** Define this as one case-scoped workbench with source panel, strategy, tasks, conversation, document tabs, proposed diffs, revision history, and explicit acceptance.

---

## Step 2 — Delete before simplifying

### Deletion guardrails

Never delete these protections in the name of simplicity:

- the `saveDocumentRevision` boundary and durable Living File sync status;
- immutable document revision history;
- marker-completeness checks and recovery for truncated model output;
- placeholder/deficiency behavior that prevents an incomplete request from becoming no document;
- jurisdiction and authority gates for high-risk instruments;
- attorney “propose, then accept” semantics;
- ownership/role checks, RLS, audit trails, retention/hold duties, and privileged-work-product boundaries;
- durable ACP/document jobs and idempotency protections.

These are complexity caused by real failure modes. The goal is to put each protection in one place, not remove it.

### Delete now — high confidence, no intended functionality lost

#### D1. Remove the unused alternate monorepo product stack

**Candidates:** `artifacts/api-server`, `artifacts/mockup-sandbox`, root `lib/api-*`, root `lib/db`, and supporting generated scaffolding.

The production application is self-contained in `artifacts/instant-attorney` and deliberately excluded from the pnpm workspace. The alternate Express health server, Drizzle placeholder, OpenAPI health spec, generated Zod package, generated React Query client, and mockup sandbox are a second architecture with no product role documented in the current canonical architecture.

**Before deletion:** confirm Replit routing and health monitoring do not still start `api-server`; move any required `/healthz` response into the production deployment. Then delete the entire unused graph, not file by file.

**Expected payoff:** removes a false architectural choice, duplicate dependency trees, misleading build surface, and onboarding cost.

#### D2. Delete `lib/case-cta.ts`

The canonical architecture already labels it orphaned, and static reference inspection found no non-test consumer. Its purpose overlaps `next-step.ts`, Mission Control, and the file deck.

**Expected payoff:** small code deletion, large conceptual clarity: next action has one owner.

#### D3. Delete or immediately connect `lib/document-generation-policy.ts`

The module contains real rules—three active generations, confidence, coverage, cost, duplicate suppression, supersession, and queue order—but current source references are tests and documentation rather than the active worker. A dormant policy is worse than no policy because readers assume it governs production.

**Decision:** if proactive generation is shipping in the next consolidation slice, make the worker call this exact policy. Otherwise delete the module and tests now and reintroduce a policy only with its caller.

#### D4. Inline `lib/document-revisions.ts` into the document boundary

This 18-line lifecycle policy exists only because document mutation rules were historically scattered. It belongs next to `saveDocumentRevision` (or in one document-lifecycle module if that boundary is deliberately kept persistence-only). Do not maintain “revision” policy in two files.

#### D5. Remove retired `pre_warmed` behavior

The UI already says the feature was retired and filters rows defensively, but the status remains in types and multiple branches. Inventory live rows, migrate or delete them, remove the enum value, and remove all fallbacks. A retired state that every query must remember to exclude is permanent accidental complexity.

#### D6. Archive stale proposals as historical records

Several design notes say “proposal,” “not yet started,” or “decision needed,” while parts of their plans have since landed. Move superseded documents to `docs/archive` with a one-paragraph disposition, or replace them with a short decision record. Do not let future agents treat three incompatible futures as requirements.

### Delete after a short observation window

#### D7. Retire the separate guided wizard UI

The wizard is a 1,354-line second chat/drafting experience with its own state, starter fields, persistence calls, recovery template, and links from Mission Control and specialist pages. It competes directly with the intended patient orchestrator.

**Keep:** instrument identity, legal authority, generation spec, risk gate, refinement, validator, renderers, fallback completion, and regeneration. These become internal services/tools.

**Delete:** the wizard as a place the user must go, its question loop, and direct links once the orchestrator can:

1. accept a document request;
2. create an immediately visible draft shell;
3. run durable generation;
4. save a structurally complete draft even with gaps;
5. expose gap-filling inline in the normal document editor;
6. recover from model truncation or job failure.

Until those six checks pass in end-to-end tests, the wizard remains a fallback, not a parallel feature to enhance.

#### D8. Delete the client-facing roadmap subsystem as a competing spine

There are authored family, bankruptcy, employment, personal-injury, lien, matter, and generic roadmap engines; multiple renderer components; a resolver; refresh/assert routes; and a separate design proposal. Meanwhile Mission Control, next-step, file deck, and standing card already tell the user where they are and what to do.

Keep a single, compact next-action/strategy representation in the Living File. Specialist roadmap logic may remain temporarily as an internal consult-brief input where it provides unique legal sequencing, but it should not remain a separate client navigation model.

**Deletion test:** if removing the roadmap panels does not prevent drafting, document access, editing, submission, attorney review, or Living File updates, it is not part of the product kernel.

#### D9. Delete unproven specialist destinations from primary navigation

Bankruptcy, family, employment, PI, lien, tax, estate, HOA, debt, defamation, and financial modules contain valuable rules. The problem is presenting many of them as separate product journeys. Each route/page needs a named legal/product owner and evidence of a distinct output. Otherwise:

- preserve deterministic calculators and legal rules as orchestrator tools;
- remove their standalone navigation and duplicated “draft this” buttons;
- delete unused page wrappers after telemetry confirms no meaningful usage.

This retains legal capability while removing user-choice complexity.

#### D10. Remove intake/freestyle as user-facing modes

Both modes use `chat-acp`; the route and UI still branch on `mode`, and orchestrator tools are enabled only for freestyle. A patient case expert should intake, investigate, plan, and draft in the same conversation. Mode changes should be internal task states, not a user-selected product architecture.

After prompt parity tests, keep one case chat and let the orchestrator select bounded tools based on intent and authorization.

### Combine rather than physically delete first

#### C1. One client draft lifecycle

Today, working output lives in `client_workspace_drafts`; promotion creates or updates a `documents` row; the workspace draft then carries a promotion link; both appear in document surfaces. This is a classic dual-identity problem.

**Target logical lifecycle:**

```text
requested → generating → working → pending_review → changes_requested
          → approved → delivered/signed
          ↘ generation_failed (still has visible recovery artifact)
```

Use one stable artifact ID from the moment drafting starts. Revision history records every material edit. “Attorney work product” and “client-visible” should be explicit visibility/privilege attributes, not a reason for unrelated editing systems.

**Safe sequence:** first expose both tables through one repository/service and one UI model; then backfill stable identities; only then consider a table migration. Do not start with SQL consolidation.

#### C2. One attorney workbench and one associate conversation

Combine general attorney chat, freestyle workspace, case brainstorm, consult assistance, and review partner chat into one case-scoped associate with task-specific tools. The workbench can open different tabs, but it should preserve one thread/context ledger and one proposal/acceptance protocol.

Document changes remain proposed diffs until accepted. Strategy changes should follow the same rule. Consultation notes and privileged materials keep their access classification.

#### C3. One case-update boundary

`parseAndUpdateFile` is the main semantic updater, but case fields are also updated by counsel, consult, title, pre-consult, organization, merge/archive/restore, and other flows. Some are administrative state changes; others alter the orchestrator's understanding.

Create one domain event contract—not necessarily one giant function—for:

- message accepted;
- fact asserted/confirmed/rejected;
- attachment analyzed;
- draft created/revised;
- deficiency added/resolved;
- attorney strategy proposed/accepted;
- consult completed;
- case merged/archived/restored.

Each meaningful event increments a case revision and queues an idempotent Living File refresh. Administrative updates such as title or legal hold need not invoke semantic extraction. The orchestrator loads one revisioned case deck assembled by one reader.

#### C4. One guidance model

Combine `next-step`, Mission Control, file deck hero, standing card, CTA logic, and any retained roadmap data behind one `CaseGuidance` result:

- current standing;
- one recommended next action;
- blockers/deficiencies;
- active document jobs;
- documents awaiting user or attorney action.

Different components may render this result, but none should independently decide the next step.

#### C5. One AI gateway and policy stack

The repository has provider clients, preferences, pricing, usage, ZDR, per-route model calls, and a 1,764-line prompt module. Route handlers should not independently select a provider, assemble cross-cutting legal policy, meter usage, retry, or log truncation.

Use one gateway with task profiles: intake, extraction, drafting, validation, attorney analysis, and summarization. A task profile owns model eligibility, privacy/ZDR, token ceiling, retry, billing, telemetry, and required validators. Provider choice remains an internal capability unless a named owner proves user-facing value.

---

## Capability-by-capability verdict

| Capability | Verdict | Why |
|---|---|---|
| Case-aware intake conversation | **Keep and elevate** | This is the primary product. |
| Durable ACP jobs | **Keep** | Restart survival protects the core journey. |
| Living File parser/extractor | **Keep, put behind event boundary** | Central case memory is essential. |
| Document plan | **Keep, simplify presentation** | Useful bounded work queue; should not become another UI. |
| Instrument profiles/authority/spec/risk/validator | **Keep** | These are non-duplicative legal-quality stages. |
| Wizard generation engine | **Keep internally** | It contains core completion and safety logic. |
| Wizard client journey | **Retire after parity** | Duplicates the orchestrator experience. |
| Workspace draft side panel | **Keep behavior, merge model/UI** | Visibility and editability are essential; parallel identity is not. |
| Document persistence boundary | **Keep exactly one** | Recently consolidated and load-bearing. |
| Document revisions | **Keep data; combine policy module** | History is essential, tiny scattered policy is not. |
| Attorney propose/accept review | **Keep** | Correct workbook control model. |
| Multiple attorney chats | **Combine** | Context fragmentation undermines the “junior associate” goal. |
| Living File/ClientFileView | **Keep, simplify cards** | It is the client grounding surface. |
| Mission Control/next action | **Keep one engine** | Necessary orientation. |
| Roadmap UI and multiple roadmap renderers | **Delete/absorb** | Competes with the same orientation job. |
| Specialist legal engines/calculators | **Keep only as tools with owners** | Capability can survive without destination proliferation. |
| Free chat | **Measure** | It is a funnel, not the core case product. |
| Dual-provider toggle | **Hide pending parity** | Adds policy/testing permutations without core value. |
| Admin observability and essential repairs | **Keep narrowly** | Operational safety; reject speculative automation. |
| Alternate Express/Drizzle/OpenAPI scaffold | **Delete after deployment check** | No canonical product responsibility. |
| Archive, retention, legal hold, audit | **Keep** | Legal and security obligations are not optional complexity. |

---

## Step 3 — Simplify the architecture that remains

### Proposed five-part architecture

```text
1. CASE WORKSPACE
   One client/attorney shell: case memo, conversation, documents, sources, tasks.

2. ORCHESTRATOR
   One case-aware agent that selects bounded tools and never directly bypasses
   persistence, authorization, billing, or legal-quality gates.

3. CASE LEDGER
   Revisioned facts, sources, assertions, deficiencies, strategy decisions,
   tasks, and domain events; one assembled case deck for model context.

4. DOCUMENT PIPELINE
   Plan → identify → ground → specify → risk gate → generate → refine →
   validate → save revision → render. A visible shell exists before generation.

5. REVIEW WORKBENCH
   The same case deck plus privileged material, associate chat, proposed diffs,
   acceptance, QA, delivery, and revision history.
```

### A simpler data vocabulary

Avoid new tables until the logical model works through adapters. The target concepts are:

- **Case** — stable matter identity and current revision.
- **Case event** — immutable input or accepted decision.
- **Source** — message, attachment, authority, consult note, or document revision.
- **Assertion** — fact/position/opinion with provenance and confidence.
- **Deficiency** — missing or conflicting information linked to affected artifacts.
- **Artifact** — any editable draft/document with visibility and lifecycle state.
- **Artifact revision** — immutable content and provenance.
- **Task/job** — durable bounded work with idempotency and recovery.

Do not create separate concepts for every screen or AI persona.

### The “never fail to finish” contract

Every drafting request should follow this deterministic envelope:

1. **Create first:** synchronously create a visible artifact shell and stable ID.
2. **Acknowledge:** show “generating,” where it will appear, and that the user can leave safely.
3. **Generate durably:** a job executes the existing legal pipeline.
4. **Recover deterministically:** if model output is truncated or invalid, save a complete instrument-shaped fallback using the generation spec—not raw partial prose.
5. **Mark gaps:** use stable, searchable placeholders such as `[[NEEDED: service date]]`, plus a structured deficiency list.
6. **Persist atomically:** save the revision through the single document boundary and queue Living File sync.
7. **Expose editing:** the same artifact opens in the editor regardless of whether it originated in chat, a specialist tool, upload improvement, or attorney workbench.
8. **Never disappear:** failed jobs remain visible with recovery/retry controls and diagnostic state.

This contract is more important than whether the UI calls the object a wizard draft, workspace draft, or document. Therefore those distinctions should disappear.

### The Living File contract

The Living File should be a projection of accepted/retrievable case events, not a collection of route-specific patches.

- Every event has `case_id`, stable event ID, actor, authorization class, timestamp, source link, and case revision.
- Extraction may propose assertions; policy determines which are automatically accepted and which require confirmation.
- The refresh job is idempotent by case revision.
- The orchestrator records which revision it loaded.
- A document revision records which case revision and sources grounded it.
- If refresh fails, the UI shows stale/pending status while retaining the event; it never silently loses input.
- Privileged attorney material is excluded from client projections by explicit visibility, not prompt convention.

### The workbench contract

The attorney should not decide which AI room knows which facts.

- One case thread can start with “review this draft,” “challenge our strategy,” “prepare for consult,” or “update the facts.”
- Tools return proposals and citations to case sources.
- Accepted proposals become events/revisions; rejected proposals remain audit history or are discarded according to retention policy.
- The document editor, strategy sheet, deficiencies, and sources remain visible beside chat.
- QA always checks the accepted revision, never an unaccepted regeneration.

---

## Step 4 — Accelerate only the remaining path

After deletions and logical consolidation:

1. **Shorten first visible artifact time.** Create the document shell before calling a model. The user should see success in under a second even if drafting takes minutes.
2. **Parallelize independent retrieval only.** Load sources, facts, authorities, and attachments concurrently, then freeze a case-revision snapshot for drafting.
3. **Stream status, not canonical prose.** Let the durable worker own the artifact; stream progress events and section completion rather than treating a browser stream as persistence.
4. **Cache by case revision and task profile.** Reuse assembled case decks and deterministic legal references until their source revision changes.
5. **Make retries idempotent.** A retry resumes or supersedes the same artifact/job; it does not create a duplicate.
6. **Test the golden path, not every screen.** One client case-to-document flow and one attorney review flow should cover all seven north-star requirements.

Suggested operational measures:

| Measure | Target |
|---|---|
| Visible artifact shell after request | p95 < 1 second |
| Draft requests producing a visible artifact | 100% |
| Drafts with unknown facts that still reach `working` | 100% |
| Living File events durably recorded | 100% |
| Living File projection current within | p95 < 60 seconds |
| Documents editable from case workspace | 100% |
| Attorney queue submissions with immutable revision | 100% |
| Duplicate artifacts caused by retries | 0 |

---

## Step 5 — Automate last

Automate only after one lifecycle and one event contract exist:

- automatic Living File projection/retry from durable case events;
- automatic document validation and deficiency extraction after each saved revision;
- automatic attorney QA on the revision the attorney accepted;
- automatic stale-context detection when a case changes after drafting;
- automatic archival/retention jobs with legal-hold checks;
- automatic health checks for stuck jobs, failed syncs, invisible artifacts, and orphan revisions.

Do **not** automate yet:

- speculative proactive drafting across multiple document types;
- multiple AI critics without a single accepted-revision gate;
- provider routing permutations that do not have parity tests;
- admin repair actions for incidents that have never occurred;
- automatic strategy acceptance without an authorized human decision rule.

---

## Sequenced deletion plan

### Slice 0 — Lock the contract (no behavior change)

**Owner:** Andrew plus one named attorney.  
**Duration:** 1–2 days.

- Approve the seven north-star acceptance tests.
- Name an owner for every survivor in the ownership register.
- Freeze new routes, states, tables, modes, and AI personas during consolidation.
- Add telemetry for actual entry points: wizard, case chat, roadmap, specialist pages, attorney rooms, draft open/edit/submit, and job failures.

**Exit:** every feature has “keep,” “retire,” or a named owner and decision date.

### Slice 1 — Delete the unquestionably dead graph

**Duration:** 1–3 days after deployment confirmation.

- Delete unused scaffold packages and mockup sandbox.
- Delete `case-cta.ts`.
- Delete or wire the unused generation policy.
- consolidate the tiny document-revision policy.
- archive stale design proposals.
- inventory and remove `pre_warmed` data/state.

**Rollback:** individual Git revert; no user data transformation except the separately reviewed legacy-state migration.

### Slice 2 — One guidance result

**Duration:** 3–5 days.

- Choose Mission Control/next-step as the only client action engine.
- Make file deck, standing, CTA, and document table consume that result.
- Remove roadmap UI and refresh/assert affordances after usage review.
- Retain only unique roadmap sequencing used by consult briefs, behind an internal adapter.

**Exit:** no screen independently computes a conflicting next action.

### Slice 3 — One drafting surface

**Duration:** 1–2 weeks.

- Make orchestrator drafting satisfy the eight-step completion contract.
- Show one combined artifact list and editor.
- Redirect specialist “draft” actions and wizard links to a case-chat intent or direct durable job.
- Keep the wizard route behind a feature flag for one release; compare completion, edit, and submit metrics.
- Remove wizard UI only after parity and recovery tests pass.

**Exit:** every draft origin yields the same stable artifact, editor, revision, deficiencies, and submission flow.

### Slice 4 — One attorney workbench

**Duration:** 1–2 weeks.

- Route attorney general chat, brainstorm, consult, and review intents into one case associate.
- Preserve privilege labels and propose/accept gates.
- Move page-local workbench behavior behind a case-workbench service/API.
- Remove redundant chat routes/components after thread migration or archive policy is decided.

**Exit:** an attorney never chooses a chat based on which context it knows.

### Slice 5 — One case event/projection boundary

**Duration:** 2–3 weeks; highest data risk.

- Classify all current `case_files` writes as administrative or semantic.
- Introduce the event contract and case revision without changing user output.
- Make semantic producers append events and refresh the projection idempotently.
- Have the orchestrator load one revisioned case deck.
- Only after stable operation, retire duplicate direct semantic patches.

**Exit:** every accepted semantic input is traceable to the Living File revision consumed by AI and documents.

### Slice 6 — Physical data consolidation, only if still valuable

**Duration:** separately estimated.

- Decide whether `client_workspace_drafts` and `documents` truly need a physical merge.
- If one repository and stable artifact ID have already removed the complexity, do not migrate merely for elegance.
- If merging, perform backfill, dual-read verification, cutover, and rollback rehearsals with a real staging database and RLS tests.

---

## The 10% over-deletion experiment

The heuristic should be applied safely through reversible flags and one-release observation, not by destroying legal data.

Proposed temporary removal set:

1. roadmap panels and roadmap navigation;
2. user-facing intake/freestyle mode choice;
3. specialist-page draft buttons;
4. dual-provider toggle;
5. separate wizard entry links after orchestrator parity;
6. redundant attorney chat entry points;
7. free-chat prominence for a measured cohort.

Predefine reinstatement criteria. Examples:

- restore a specialist tool entry if task completion falls by more than 5% for its owned cohort;
- restore wizard fallback if completed-visible-editable draft rate drops below 99.5%;
- restore roadmap only if users demonstrably lose orientation and one-next-action UX does not correct it;
- restore a chat room only if privilege or task isolation cannot be expressed safely in the unified workbench.

If none of these needs partial restoration, the next deletion pass should be more aggressive. Reintroduce only the minimum capability, never the old subsystem wholesale.

---

## Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Wizard removal reduces draft completion | Medium | Critical | Completion contract, visible shell, fallback template, feature flag, parity E2E. |
| Draft-table merge loses access boundaries | Medium | Critical | Logical adapter first; explicit visibility/privilege; RLS staging tests; delay physical merge. |
| Unified attorney chat leaks privileged content | Medium | Critical | Server-enforced source classes, separate projections, authorization tests, no prompt-only isolation. |
| Living File event conversion drops updates | Medium | Critical | Append-before-project, idempotency, revision lag UI, dual-run comparison. |
| Roadmap deletion harms orientation | Low/Medium | Moderate | One next action plus deficiencies and document status; cohort metrics. |
| Deleting scaffold breaks deployment health | Low | High | Inspect live routing/process config before deletion; move health endpoint first. |
| Legacy state migration misses live rows | Medium | High | Production inventory, backup, staged migration, post-migration assertion. |
| Simplification removes legal safeguards | Low | Critical | Guardrail list treated as architectural constraints; named attorney approval. |
| Large consolidation PR recreates parallel-agent conflicts | High | High | Small vertical slices, one owner, rebase before work, architecture ownership tests. |

---

## Verification required before any deletion PR

1. Query real production/staging usage for each destination and state; repository references do not prove user value.
2. Inventory `pre_warmed` rows and workspace-draft promotion relationships.
3. Map RLS and service-role usage for artifacts, revisions, attorney work product, and case events.
4. Verify deployment routing before removing `api-server`.
5. Run typecheck, unit tests, schema strict check, lint, build, and focused end-to-end journeys with installed dependencies.
6. Test with interrupted generation, invalid model markers, missing jurisdiction, missing facts, duplicate submission, browser close, job retry, failed Living File sync, and attorney rejection.
7. Confirm all artifacts remain findable and editable for both client and authorized attorney.

### Required golden-path tests

- Client starts with three missing required facts; document still appears, is structurally complete, and flags all three gaps.
- Client closes the browser during generation; the same artifact completes or exposes recovery on return.
- Model response truncates; raw partial text is not mistaken for filing-ready text, but the user still receives a complete fallback artifact.
- Client edits and submits; attorney sees the exact immutable revision.
- Attorney asks the associate to revise; proposed changes do not write until accepted.
- Attorney accepts; QA evaluates the accepted revision and Living File records the new document state.
- A later fact conflicts with the draft; the case indicates staleness/deficiency rather than silently rewriting an approved document.
- Every retry is idempotent and produces no duplicate artifact.

---

## Bottom line

The right simplification is not “fewer legal safeguards” or “one enormous AI route.” It is **one product journey and one owner per capability**.

Keep the legal-quality pipeline, durable jobs, persistence boundary, revision history, authorization, and acceptance controls. Delete competing user journeys, dormant policies, retired states, false scaffolds, duplicated guidance, and extra AI rooms. Move specialist intelligence behind the orchestrator instead of asking clients and attorneys to navigate the implementation.

If executed in the sequence above, the end state is smaller and more reliable while preserving exactly what you described as success: the AI knows the current file, every requested document completes visibly and editably, deficiencies are honest rather than fatal, and the attorney works the same living case with an AI junior associate.

---

## Repository evidence index

- Canonical capability ownership and known duplication: `artifacts/instant-attorney/docs/ARCHITECTURE.md`.
- Actual package isolation and workspace exclusions: `CLAUDE.md`, `pnpm-workspace.yaml`, and `artifacts/instant-attorney/package.json`.
- Primary client chat/orchestrator surfaces: `app/chat/page.tsx`, `app/api/chat-acp/route.ts`, `lib/orchestrator-tools.ts`, and `lib/acp-jobs.ts`.
- Guided drafting duplication: `app/wizard/[type]/page.tsx`, `app/api/wizard/route.ts`, and `lib/wizard-parsing.ts`.
- Canonical document persistence: `lib/document-persistence.ts` and its boundary tests.
- Parallel draft lifecycle: `app/api/workspace/drafts/**`, `client_workspace_drafts` references, and promotion routes.
- Attorney review: `app/attorney/review/[id]/page.tsx`, `lib/attorney-review.ts`, and attorney document routes.
- Guidance overlap: `lib/next-step.ts`, `lib/mission-control.ts`, `lib/file-deck.ts`, roadmap modules, and their components.
- Living File writers: `lib/file-parser.ts`, `lib/living-file-extractor.ts`, document persistence, consult/counsel flows, and case-file routes.
- Legacy state evidence: `pre_warmed` references in types, dashboard filtering, document utilities, and wizard behavior.
- Superseded/proposed futures: root `docs/*.md` design and migration notes.

