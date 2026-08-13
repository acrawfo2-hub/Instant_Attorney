<!--
  SUPERSEDED — audited the wrong checkout.
  Kept so a later agent does not rediscover this PR and treat it as current.
-->

> **Status: SUPERSEDED. Do not implement from this document.**
>
> This re-audit inspected commit `a7ee109` on a branch named `work`, which is
> not in this repository. Its file counts (590 TS/TSX files, 130 API routes,
> the wizard page, five attorney rooms, `pre_warmed`, `case-cta.ts`) describe
> the tree *before* consolidation chunks 2–7 landed.
>
> On current `main` those P0 findings are already false: the document worker
> calls `draftInstrument`; `/wizard` is gone; attorney freestyle and brainstorm
> rooms are gone; the roadmap spine is gone; `pre_warmed` is gone from
> application code; `case-cta.ts` and `document-generation-policy.ts` are gone.
>
> Current contract: `ARCHITECTURE.md` (ownership today) and `CONSOLIDATION.md`
> (what was kept, changed, or deferred).

# Instant Attorney — Simplification Verification and UX Audit

**Audit date:** August 13, 2026  
**Repository baseline:** commit `a7ee109` on branch `work`  
**Scope:** `artifacts/instant-attorney`, its surrounding workspace, and the current client and attorney experience  
**Type:** Static implementation verification, failure-path audit, and UI/UX review; no application code changed  
**Confidence:** High for code-path existence and architectural contradictions; medium for rendered UX; low for production behavior because no live Supabase project, representative case data, or installable application dependencies were available

---

## 1. Executive verdict

### The uncomfortable finding

The simplification described after the August 12 audit is **not present in this checkout**.

The current branch contains the prior audit as its newest commit, directly on top of the same product commit audited yesterday. The measurable baseline is also unchanged: 590 TypeScript/TSX files, 90,134 lines, 130 API routes, 120 unit-test files, and 75 root migration SQL files. The same guided wizard, workspace-draft subsystem, roadmap family, `pre_warmed` compatibility paths, unused workspace scaffold, multiple attorney AI rooms, orphaned `case-cta.ts`, and unwired `document-generation-policy.ts` remain.

This does **not** mean no simplification work exists anywhere. It means it cannot be evaluated from the repository state supplied for this audit. Before acting on this report, confirm that the intended simplification branch or merge commits were actually checked out and pushed. If a different branch contains that work, rerun this audit there rather than treating this document as a verdict on code that is not visible.

### More important: a critical integration split remains

The intended architecture says planned documents use the canonical legal generation pipeline. The implementation does something else:

1. the orchestrator emits a document plan;
2. `dispatchDocumentPlan` creates `document_generation_jobs` rows;
3. the document worker creates a `client_workspace_drafts` shell only after a worker claims the job;
4. the worker calls Anthropic directly with a short generic prompt;
5. it writes raw output directly to the workspace draft and marks the job ready.

That worker does **not** use the instrument identity, pinned authority, generation specification, jurisdiction risk gate, refinement, validator, marker completeness, fallback completion, document revision history, canonical document persistence boundary, or Living File document sync described in the architecture.

This is the central finding of the reaudit. It threatens north stars 2, 6, and 7 simultaneously. It is not merely leftover code; it is the currently documented orchestrator drafting path.

### Overall assessment

| Dimension | Verdict | Meaning |
|---|---|---|
| Product intent | **Strong** | The seven principles are coherent and the UI copy often reflects them. |
| Simplification implemented in supplied checkout | **Not demonstrated** | Repository topology and counts match the prior baseline. |
| Client intake | **Partial** | Durable conversation is strong; mode split and recovery language remain. |
| Document completion guarantee | **Fail** | A failed worker can leave an empty shell and there is no deterministic complete fallback in the planned-document worker. |
| Document visibility/findability | **Partial, improving** | The file deck and document view aggregate both stores, but users still traverse two identities and two editing locations. |
| Editability and history | **Partial** | Promoted documents have revisions; unpromoted workspace drafts do not have equivalent immutable history. |
| Attorney junior-associate workbench | **Strong but fragmented** | Document review is capable; strategy, brainstorm, consult, and document partner remain separate contexts. |
| Living File currency | **Partial / unproven** | Chat has durable extraction mechanisms, but workspace generation and several semantic updates do not share one event boundary. |
| Anti-invention controls | **Fail on planned-worker path** | The strong wizard controls are bypassed by the new direct worker. |
| Client UX | **Promising structure, excessive concepts** | The deck is calmer, but labels, destinations, parallel document states, and hidden transitions can confuse a nervous client. |
| Attorney UX | **Powerful, high cognitive load** | Maximum flexibility exists, but it is distributed across rooms, pages, controls, and overlapping revision concepts. |

### Release recommendation

Do not represent “every requested document completes safely” or “all orchestrator drafts use the legal pipeline” as verified production behavior yet. Before adding features, make the planned-document path pass one end-to-end contract:

> Request → immediately visible artifact → canonical grounded generation → structurally complete fallback with explicit deficiencies → editable content → immutable revision → Living File sync → exact revision submitted to attorney.

---

## 2. Audit method and evidence limits

### Inspected

- current Git ancestry and changes after the previous product baseline;
- source and file counts;
- all client and attorney pages and API-route inventories;
- orchestrator planning, document worker, workspace drafts, promotion, document persistence, revision, Living File extraction, and attorney review paths;
- the case-file deck, tile navigation, chat/draft split view, document table, attorney file, and review workbench;
- static accessibility cues such as roles, labels, status regions, focus behavior, and keyboard handlers;
- the five available “next step” screenshots in `attached_assets/screenshots`.

### Not available

- a deployed URL or browser-authenticated client and attorney account;
- a connected staging or production Supabase database;
- production route/job/usage telemetry;
- application-local `node_modules`, so typecheck, unit tests, schema strict checking, build, and Playwright could not execute;
- current screenshots for the full case deck, split chat/draft editor, document detail, mobile UI, or attorney workbench.

Accordingly, “works” below means the static code contains a coherent path. It does not mean database migrations are applied, RLS permits the operation, scheduled workers run, environment variables exist, or a human can complete the flow in a browser.

---

## 3. Delta check against the August 12 audit

| Prior concern | Current implementation evidence | Status |
|---|---|---|
| Alternate Express/Drizzle/OpenAPI/mockup scaffold | All packages and workspace entries remain. | **Not addressed** |
| Orphaned `case-cta.ts` | File and test remain; architecture still labels it orphaned. | **Not addressed** |
| Dormant `document-generation-policy.ts` | File and tests remain; no production caller found. | **Not addressed** |
| Scattered document revision policy | `document-revisions.ts` remains and is called by fill-info. | **Not addressed** |
| Retired `pre_warmed` status | Twelve non-test source files still reference it; UI filters stragglers. | **Partially contained, not deleted** |
| Wizard as a separate journey | Wizard page, route, links, parsing, starter questions, and regeneration remain. | **Not addressed** |
| Workspace drafts separate from documents | Both records, APIs, editors, promotion link, and UI bands remain. | **Not addressed** |
| Roadmap as competing spine | Roughly 35 roadmap-named files remain, including APIs and renderers. | **Not addressed** |
| Intake/freestyle mode split | Route, types, prompts, links, and UI references remain. | **Not addressed** |
| Multiple attorney AI rooms | Brainstorm, freestyle work-product chat, document partner, and consult AI surfaces remain. | **Not addressed** |
| Multiple guidance engines | CaseHub/file deck coexist with Mission Control, next-step, and roadmap logic. | **Partially hidden for client; still structurally duplicated** |
| One AI gateway | Direct provider calls and route-local policies remain. | **Not addressed** |
| One case-event/Living File boundary | Direct semantic and administrative case updates remain across workflows. | **Not addressed** |

### What does appear genuinely improved in this baseline

These are valuable and should not be erased during consolidation:

- The client file is designed as a deck with stable tiles instead of one enormous wall of content.
- The landing view emphasizes “Where things stand” and one next action.
- A mobile sticky “Continue legal chat” control keeps the assistant reachable.
- Workspace draft loading distinguishes loading, empty, and error states.
- Deep-link focus avoids silently opening the wrong draft.
- Document-job status is visible in both the case documents view and the chat draft panel.
- The document table groups working drafts, forms, uploads, attorney-review items, and final documents.
- Attorney review contains an editable working copy, persisted partner thread, proposed diffs, accept/reject, revision restore/branch, comparison, QA findings, citations, comments, and delivery controls.
- The canonical `documents.draft_text` writers are guarded by a single persistence boundary test.

Those improvements solve real UX and integrity problems. They do not, by themselves, collapse the underlying parallel architectures.

---

## 4. North-star verification

## Principle 1 — A user can start with an incomplete story and the AI patiently identifies what matters

**Rating: PARTIAL — plausible happy path, not verified end to end.**

### Supporting evidence

- The case chat persists user and assistant messages.
- ACP turns have durable database rows, a per-case sequence, acknowledgments, and restart reconciliation.
- The client can leave while a turn runs and later poll for its result.
- The Living File extractor can process conversation even when the inline structured block is missing.
- The file deck surfaces fact gaps and offers inline answers.
- Chat includes an explicit drafting suggestion that instructs the assistant to use placeholders and ask first if the intended document is unclear.

### Failure and confusion risks

- `ChatMode` still exposes the old distinction between intake and freestyle, while orchestrator tools are enabled only in freestyle. The system therefore has two behavioral personalities inside the same nominal case expert.
- The route accepts both modes, but the UI often hardcodes `mode=freestyle`; older paths and stored state can still choose different capabilities.
- Restart reconciliation tells the user to send the turn again if persistence did not complete. That is honest, but it is not a patient continuation of the same task and may duplicate intent.
- The response pipeline may update the Living File twice: inline parsing and later extractor sweep. A watermark reduces duplication, but two semantic paths remain.
- “Patiently identifies what matters” is prompt behavior, not a deterministic interaction policy. There is no visible test for one-question-at-a-time pacing, plain-language explanations, anxiety-sensitive copy, or confirmation before changing disputed facts.

### UX verdict

The client should never see “intake” or “freestyle.” Use one visible concept: **Case assistant**. Internally the orchestrator may switch tasks, but the header should continuously answer:

1. What is the assistant doing?
2. What does it need from me now?
3. What was saved to my file?
4. Can I leave safely?

### Acceptance test

A first-time client gives a disorganized, incomplete story containing uncertainty and emotion. The assistant acknowledges the concern without implying legal representation, summarizes only supported facts, labels uncertainty, asks one high-value question at a time, allows “I don't know,” updates the file after confirmation, and resumes correctly after browser close or server restart.

---

## Principle 2 — Every drafting request produces a complete, visible, editable artifact with explicit gaps

**Rating: FAIL — the current planned-document worker does not guarantee this.**

### What works

- Document plans are bounded to three jobs and idempotent by plan revision and identity.
- Once a worker claims a job, it creates a workspace-draft shell before the model call.
- The prompt tells the model to use `[[missing fact]]` placeholders.
- Workspace drafts are editable and display placeholders as highlighted blanks.
- Draft jobs are polled and shown independently; a ready sibling need not wait for another job.

### Critical gaps

1. **Not immediately visible:** the shell is created when a worker claims the job, not when the request/plan is committed. A queued job with no running cron has status but no editable artifact ID.
2. **Failure can produce an empty artifact:** when generation throws, the job is marked failed; the shell content remains empty. There is no deterministic instrument-shaped fallback.
3. **No completeness check:** any returned text—including empty or truncated text—can be written and marked `ready`.
4. **No marker protocol:** the worker does not require `---DRAFT READY---` / `---END DRAFT---` even though the architecture calls marker completeness load-bearing.
5. **No legal pipeline:** the worker bypasses instrument profiles, authority, generation specification, risk gate, refinement, validation, and render readiness.
6. **No placeholder validation:** the prompt asks for placeholders, but no code detects invented facts, converts missing data to a structured deficiency list, or rejects unmarked uncertainty.
7. **No canonical document revision:** output lands in `client_workspace_drafts`, not `documents`/`document_revisions`.
8. **No supersession policy:** the production worker does not call the existing policy that prevents stale plan jobs from persisting.
9. **No stale-context check:** `input_fact_revision` is stored but the worker does not verify it immediately before writing.

### Required correction at architecture level

There must be one `generateArtifact(job)` service used by both orchestrator and any retained wizard path. It should create the stable artifact at dispatch time and then execute:

```text
identity → authority → specification → jurisdiction/risk gate → generation
→ marker/completeness parse → deterministic fallback → refinement
→ validation → immutable revision → Living File sync
```

Unknown jurisdiction may block filing-specific assertions, but it must not block delivery of a complete **working** document. The fallback should preserve the instrument structure and insert an explicit governing-law deficiency rather than hallucinating or abandoning the artifact.

### UX requirement

The client should see one card immediately:

- title;
- status in plain language (“Drafting,” “Ready for you,” “Needs 3 details,” “With attorney”);
- a promise that it is safe to leave;
- “Open now” even while drafting, showing a skeleton or working outline rather than an empty editor;
- a failure state that says what remains saved and offers retry without creating another artifact.

### Acceptance test

Force model timeout, malformed output, missing jurisdiction, missing required facts, worker restart, stale plan revision, and failed persistence. Every case must leave exactly one visible artifact with complete section structure, explicit deficiencies, editable content, and a recoverable status.

---

## Principle 3 — A user can always find every current document and its status from the case workspace

**Rating: PARTIAL — good aggregation, unresolved identity and navigation complexity.**

### Supporting evidence

- The dashboard fetches both top-level documents and workspace drafts.
- The file deck ranks both types and links to them.
- The stable tile map has “Drafted documents” and “Attorney review.”
- The document detail view groups working drafts, forms, uploads, items with the attorney, and other documents.
- Background revisions are polled and the page announces recent updates.
- Deep links include a requested draft ID and report when that specific draft cannot be found.

### Remaining ghosts

- A workspace draft opens in the chat side panel; a promoted document opens in the case document view or wizard. “Where do I edit this?” depends on storage type.
- Promotion produces a second identity and a backlink rather than evolving one artifact.
- “Drafted documents,” “Working drafts,” “Drafts & documents,” “On file,” and “With your attorney” overlap semantically.
- The same object may appear in a workspace band and document/review band through the promotion relationship.
- The dashboard filters `pre_warmed` rows defensively instead of eliminating the retired state.
- Eight file tiles plus header actions, a next-step block, status memo, and mobile assistant bar can still compete for attention.

### UX recommendation

Use one **Documents** destination and one artifact card taxonomy:

| State | Client label | Primary action |
|---|---|---|
| queued/generating | Drafting | Open progress |
| working with deficiencies | Needs your details | Fill details |
| working and complete | Ready for you | Review and edit |
| submitted | With your attorney | View submitted version |
| changes requested | Attorney requested changes | Review changes |
| approved | Attorney approved | View/download |
| delivered/signed | Completed | View final record |
| failed with fallback | Draft saved; generation needs retry | Open saved draft |

Do not expose database nouns such as “workspace draft,” “promoted,” “revision document,” or “pre-warmed.”

### Acceptance test

Give a client ten artifacts spanning all states, including one failed job and one promoted draft. From the case overview, the client must locate any named artifact, understand its status and next action in under ten seconds, and never see two current cards for the same artifact.

---

## Principle 4 — A user or authorized attorney can edit without losing history

**Rating: PARTIAL — strong attorney document history, weak pre-promotion history.**

### Supporting evidence

- Canonical document text writes pass through `saveDocumentRevision`.
- Attorney review autosaves, warns about unsaved/error state, and creates immutable revision records.
- Attorneys can restore or branch from a historical revision and compare with a previous or submitted revision.
- The client workspace editor protects unsaved local changes during polling and waits for save before promotion.
- Promoted-draft edits can create review revisions without overwriting an approved original.

### Remaining risks

- Ordinary edits to an unpromoted workspace draft update the same row; immutable revision history begins only after promotion.
- Delete says “cannot be undone” and physically removes the working draft from the user's perspective. That conflicts with the overall “without losing history” expectation for legal work product.
- The attorney workbench uses `sendBeacon` during unload for a PATCH route. Beacon sends POST semantics, so it should not be relied on as the loss-prevention guarantee without an end-to-end browser test.
- Autosave, accepted AI proposals, accepted review improvements, restore, branch, second draft, and submitted baseline all use revision-like concepts with different UI labels.
- Two notions remain in architecture: immutable `document_revisions` and a non-FK `current_revision_id` sync marker. This is safe internally only if no UI or domain service conflates them.

### UX recommendation

- Show a single “Saved” indicator with last saved time and recovery affordance.
- Replace irreversible Delete with Archive/Move to trash and a retention period.
- Give both clients and attorneys a readable activity timeline: who changed what, when, and why.
- Call branching “Create a new version from this point”; reserve “revision” for immutable history.
- Make the exact submitted version visibly locked while allowing a new working version beside it.

### Acceptance test

Edit rapidly in two tabs, disconnect during autosave, close the tab immediately, restore an older revision, accept an AI proposal, reject another, and resubmit. No accepted text may disappear; the submitted original must remain byte-identical and understandable in history.

---

## Principle 5 — An attorney can use a case-aware junior associate to update strategy and documents

**Rating: PARTIAL-STRONG — best-developed principle, but fragmented.**

### Supporting evidence

- The review page presents context, cover sheet, editable revision, AI partner, comments, review findings, QA, citations, revision history, and delivery.
- AI edits arrive as proposals and do not alter content until accepted.
- Partner conversation is persisted.
- Attorney can accept, edit-and-accept, reject, request client input, restore, branch, compare, and run QA.
- QA is designed to evaluate the active accepted revision rather than an unapproved rewrite.
- Client submission remains distinct from attorney work product.

### Fragmentation

- Document partner chat exists only in the review workbench.
- Strategy brainstorm is a separate tab and separate message table.
- Attorney freestyle chat is embedded elsewhere.
- Consult notes, brief generation, wrap-up, fee estimate, and closeout are separate AI surfaces.
- The full Living File opens via a link rather than remaining visible/selectable beside the work.
- Updating strategy follows a different proposal/apply path from document edits.
- The review page contains many advanced controls in one 1,187-line client component; progressive disclosure exists, but the information architecture is still tool-centric.

### Attorney UX recommendation

Create one **Matter Workbench** with persistent regions:

1. **Matter navigator:** sources, Living File, facts, gaps, strategy, tasks, documents, history.
2. **Active work canvas:** document editor, strategy editor, consult prep, or evidence table.
3. **Associate panel:** one case-aware conversation whose selected task and source scope are explicit.
4. **Decision tray:** proposed changes, accept/reject/edit, affected artifact, and provenance.

Allow power users to resize, collapse, pin, open in a new window, compare versions side by side, and save workspace layouts. Flexibility should come from configurable panes, not from separate AI rooms with separate memories.

### Safety requirement

Every associate answer should expose:

- case revision loaded;
- sources considered;
- whether it is proposing fact, strategy, or document changes;
- which changes require attorney acceptance;
- which client-visible projection will be affected.

### Acceptance test

An attorney starts from a submitted document, asks the associate to find inconsistent facts, opens the cited attachment, proposes alternative strategy, edits and accepts part of a redline, rejects another part, updates the strategy, and sends an exact approved version—without navigating to another chat or losing context.

---

## Principle 6 — Every meaningful accepted input updates or durably queues the Living File

**Rating: PARTIAL / NOT PROVABLE.**

### Strong elements

- Chat messages are persisted and ordered.
- Inline file blocks use completeness guards.
- A background extractor can catch turns lacking inline blocks.
- Message cursors and watermarks reduce reprocessing.
- Canonical document revisions set durable sync status to pending, synced, or failed.
- Client document surfaces poll a composite revision endpoint and refresh after background changes.

### Broken coverage

- Planned document generation writes workspace content directly and does not call the document persistence/Living File sync boundary.
- Unpromoted workspace edits are not clearly represented as Living File events.
- The worker's `input_fact_revision` is not checked when the result is saved.
- Attachments, consult wrap-up, counsel updates, brainstorm apply, title generation, merge/archive/restore, and other flows update different subsets of the case through different functions.
- Chat semantic updates can arrive through inline parse and background extraction; the exact accepted-source policy is not one contract.
- “Every input” is still an architecture promise rather than an enumerated event coverage test.

### Required event coverage table

| Event | Durable before response? | Living File effect | Client-visible status |
|---|---|---|---|
| User message accepted | Yes | Queued extraction through cursor | Updating/current/failed |
| Fact accepted/rejected | Yes | Update assertion and case revision | Visible immediately |
| Attachment stored | Yes | Pending analysis event | Uploading/analyzing/ready/failed |
| Attachment analysis accepted | Yes | Add sourced assertions/deficiencies | File updated |
| Artifact revision saved | Yes | Add/resolve deficiencies and provenance | Sync status |
| Attorney proposal accepted | Yes | Strategy/document event | Exact affected item shown |
| Consult completed | Yes | Wrap-up/next-action event | File updated |
| Case merge/archive/restore | Yes | Projection lifecycle event | Unambiguous state |

### Acceptance test

For each event above, interrupt the process after durable write but before projection. On recovery, the Living File must converge exactly once, expose stale/pending status until it does, and record the case revision consumed by subsequent AI work.

---

## Principle 7 — The system never invents governing law, authority, facts, or completion

**Rating: FAIL on the planned-document path; PARTIAL elsewhere.**

### Strong controls worth preserving

- Wizard generation classifies instrument risk and can require governing forum.
- Instrument profiles, pinned authority resolution, generation specs, refinement, and validation exist.
- Markerless wizard output is treated as recovery material rather than a ready draft.
- Prompt language distinguishes placeholders from invented facts.
- Review QA and authority checks exist.
- The client file separates confirmed facts, gaps, and hypotheticals.

### Critical bypass

The planned-document worker receives title, summary, jurisdiction, and fact rows, then asks a model to “draft only the requested legal working document.” It does not resolve governing authority, enforce jurisdiction, verify citations, apply an instrument specification, parse completeness markers, or validate the result. It marks output ready based on model-call success, not legal or structural completion.

The prompt-level instruction not to invent facts is necessary but not sufficient. It cannot prove that a plausible statute, deadline, required clause, court, form, or legal conclusion was not invented.

### Additional wording risk

The current progress UI promises a path to a “final, attorney-reviewed document.” That wording is understandable, but a nervous user may read every generated working draft as legally approved, particularly when status labels say “Ready.” Reserve “approved” for an explicit attorney action and pair AI-generated content with a calm, specific status—not a generic disclaimer wall.

### Acceptance test

Generate each high-risk instrument with missing jurisdiction, conflicting jurisdictions, absent required facts, malicious attachment instructions, fake authorities in the user story, and model truncation. No artifact may claim a jurisdiction, source, fact, filing readiness, or attorney approval that is not traceable to an accepted source and state transition.

---

## 5. Dinosaur and ghost inventory

## Priority 0 — Active contradictions, not dead code

### P0.1 Planned-document worker versus canonical pipeline

**Action:** Replace the raw direct generation path with the canonical artifact pipeline before expanding orchestrator drafting. This is the highest risk because it appears modern and durable while bypassing older safety work.

### P0.2 Two document systems

**Action:** Introduce one artifact service and stable identity across workspace and review. Do not begin with a physical table merge. First make all reads, edits, states, and history flow through one logical API.

### P0.3 Living File coverage is not event-complete

**Action:** Build an enumerated producer/consumer coverage test for every semantic event. One durable queue or outbox is preferable to fire-and-forget projection calls.

## Priority 1 — Confirm and delete

- `lib/case-cta.ts` and its isolated test, after confirming no dynamic consumer.
- `lib/document-generation-policy.ts` if it is not immediately made the single worker policy.
- `pre_warmed` type/branches after a real-data inventory and cleanup migration.
- unused alternate packages: `artifacts/api-server`, `artifacts/mockup-sandbox`, root `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, and `lib/db`, after deployment/health-route confirmation.
- stale proposal documents that are being mistaken for current architecture.

## Priority 2 — Collapse user-visible journeys

- guided wizard UI into the case assistant while retaining its pipeline;
- intake/freestyle labels into one assistant;
- roadmap panels into one next-action model;
- standalone specialist drafting buttons into assistant tool intents;
- attorney brainstorm/freestyle/review chats into one workbench associate.

## Priority 3 — Large files that need boundaries, not arbitrary splitting

- `app/chat/page.tsx`: conversation transport, composer, attachment flow, draft focus, background job reconciliation, and split-pane layout should have separate state owners.
- `app/attorney/review/[id]/page.tsx`: revision state, review run, QA, citations, comments, delivery, and layout should be coordinated by a workbench model rather than page-local state.
- `components/CaseDocumentsTable.tsx`: artifact query/view model should be separated from upload, polling, editing, and status rendering.
- `lib/prompts.ts`: task profiles and shared legal policy should be composed explicitly so conflicting instructions can be tested.
- `lib/types.ts`: split by domain vocabulary only after duplicate concepts are removed; otherwise splitting merely hides them.

---

## 6. Client UI/UX audit — confused and nervous client

### What the current direction gets right

- A stable map near the top lowers the fear of losing work.
- “Where things stand” is more reassuring than a technical dashboard.
- One prominent next action reduces decision paralysis.
- The copy explains that accepted chat updates refresh the case file.
- Loading, error, processing, saved, and background-update states are increasingly explicit.
- Placeholders are highlighted and can be jumped to.
- A mobile assistant bar keeps help reachable after scrolling.
- Detail views avoid stacking the entire case on one overwhelming page.

### Highest-impact UX problems

#### 1. The interface still exposes architecture

The client encounters case file, Living File, legal chat, workspace draft, document, form, upload, financial vault, attorney review, strength check, other side's position, roadmap-derived next action, and consult. Each term may be defensible alone; together they create a learning burden during stress.

**Recommendation:** Use four primary destinations only:

1. **Overview** — where things stand and the one next step.
2. **Messages** — the case assistant.
3. **Documents** — every artifact and upload.
4. **Case details** — facts, key dates, strategy, people, and money.

Attorney/help access can remain persistent rather than a fifth content ontology.

#### 2. “Legal chat” is functional but emotionally cold

For a nervous person, “Continue with your case assistant” is clearer and more relational. “Legal chat” can sound like generic support or imply legal advice. The assistant entry should retain the matter title and the last unresolved question so returning feels continuous.

#### 3. Eight tiles are stable but not necessarily calm

Eight equal-weight choices reintroduce decision burden. Use status-weighted progressive disclosure:

- one next action;
- “Needs your attention” with at most three items;
- “Your documents”;
- collapsed “Everything in your case.”

Keep stable destinations, but do not give every destination equal visual urgency.

#### 4. Status language needs a controlled vocabulary

“Ready,” “Draft,” “On file,” “Stored,” “Analyzed,” “Completed,” “Approved,” and “Delivered” have legal implications. Define and test a single client vocabulary. Every state must answer “What happened?” and “What should I do?”

#### 5. Failure states must preserve trust

Never show an empty editor after saying drafting started. Use:

> “Your draft is saved. We could not finish generating the language yet. You can open the outline now or retry; you will not create a duplicate.”

Likewise, never let a network failure look like “you have no documents.” The draft panel already moves in the right direction.

#### 6. Reassurance must be specific, not ornamental

Good reassurance:

- “Saved at 2:14 PM.”
- “You can leave this page; drafting will continue.”
- “Three details are still needed, but your document is complete enough to review.”
- “Your attorney has not approved this version yet.”

Avoid broad reassurance such as “everything is taken care of” or visually celebratory “done” states before legal completion.

### Client accessibility checklist

- Make every clickable document row a real button/link; a `div` with `role=button` also needs Enter and Space behavior and visible focus.
- Announce background state changes without repeatedly interrupting screen readers; use one polite live region per job list.
- Give every textarea and title input a visible label, not placeholder-only labeling.
- Preserve 44px minimum targets on mobile, particularly close, retry, and placeholder chips.
- Do not rely on gold/green/gray alone for legal status.
- Test 200% zoom, keyboard-only use, reduced motion, long document titles, and narrow split-pane behavior.
- When “Open draft” scrolls on mobile, move programmatic focus to the draft heading so screen-reader and keyboard users arrive too.
- Confirm the five-step progress indicator does not imply that attorney review is guaranteed, underway, or complete when it is not.

---

## 7. Attorney UI/UX audit — maximum visibility and ability to tinker

### What is strong

- Three-pane review is the correct desktop mental model: context, active document, associate.
- Panes can collapse.
- Save state is visible.
- Proposed changes show before/after and require acceptance.
- Revision compare, restore, and branching enable non-destructive experimentation.
- QA findings, citations, comments, delivery, and exact attachment identity support professional control.

### What limits expert flexibility

#### 1. Context is linked away

An attorney editing language should be able to pin the relevant fact, attachment passage, authority, or strategy beside the clause. “View full file” navigation breaks cognitive continuity.

#### 2. Too many vertical workflows occupy one page

Critical review, improvements, standalone QA, editor, partner, comments, second-draft prompt, revisions, and delivery are stacked into one workbench. Collapsing helps but does not establish hierarchy.

**Recommendation:** top-level workbench tabs should be **Draft**, **Issues**, **Sources**, **History**, and **Delivery**. The associate remains available across tabs and knows the active selection.

#### 3. Associate scope is implicit

The attorney needs to see whether the associate is using the submitted version, current working copy, selected revision, full Living File, or a pinned subset of sources. Add a visible scope chip and source drawer.

#### 4. Direct editing and AI proposals can race

The UI correctly rejects a proposal when its “before” passage no longer exists, but experts need proposal rebasing, conflict indication, and batch review rather than a generic failure message.

#### 5. Strategy edits do not share document proposal semantics

The associate should propose a strategy delta with the same before/after, rationale, sources, acceptance, and history model used for document edits.

### Attorney power-user specification

- resizable panes and saved layouts;
- keyboard command palette;
- full-text search across facts, sources, messages, and revisions;
- pin source excerpts beside the editor;
- clause-level comments and proposal anchors;
- side-by-side or inline redline modes;
- named checkpoints and compare-any-two versions;
- source/citation validation visible at the clause level;
- filter QA findings by severity, source, unresolved state, and affected section;
- export exact revision with manifest of case revision and authorities;
- separate private work product from client-visible material with persistent badges;
- undo for accept/reject through a new revision, never destructive mutation.

---

## 8. Verification plan: proving it will actually work

### Gate A — Static architecture

- one production caller for each canonical capability;
- no direct planned-document model call outside the generation service;
- no document/workspace content writes outside the artifact boundary;
- every semantic event listed in a Living File coverage registry;
- no production references to retired states;
- no destination without an inbound navigation path and named owner;
- schema guard and migration order pass.

### Gate B — Real database integration

Run against a freshly migrated local/staging Supabase database, not mocks:

- RLS ownership for client artifacts;
- attorney access without cross-matter leakage;
- service-role routes verify authorization before privileged access;
- concurrent plan dispatch idempotency;
- worker claim race;
- revision append/restore/branch;
- outbox/Living File idempotency;
- upload processing and failure recovery;
- archive/legal-hold behavior;
- query/index performance for case-deck load.

### Gate C — Failure injection

- worker never starts;
- process dies before shell creation, after shell creation, after model response, and during save;
- model returns empty, malformed, truncated, contradictory, or prompt-injected text;
- Living File sync fails repeatedly;
- client edits while background refresh arrives;
- promotion races with autosave;
- attorney accepts a proposal while another edit changes its anchor;
- webhook/job is delivered twice;
- browser closes during client and attorney saves.

### Gate D — UX usability

Test with at least five clients unfamiliar with legal workflow and five practicing attorneys.

Client tasks:

1. explain what the system needs next;
2. find a named draft;
3. identify what is missing;
4. edit and save it;
5. explain whether an attorney has approved it;
6. leave and resume without fear of losing work.

Attorney tasks:

1. identify the exact submitted revision;
2. inspect its factual sources;
3. request and selectively accept AI changes;
4. revise strategy;
5. compare and restore versions;
6. approve and send the exact intended artifact.

Targets:

- 100% task completion for find/open/edit/submit/restore;
- zero mistaken beliefs that an AI draft is attorney-approved;
- zero duplicate artifacts during retry;
- median client confidence of at least 4/5 after each task;
- attorneys can complete the core review without leaving the workbench;
- WCAG 2.2 AA automated and manual keyboard checks pass.

---

## 9. Recommended sequence

### Phase 0 — Verify repository provenance

Confirm the actual simplification commits/branch. Record before/after hashes and regenerate file, route, state, and subsystem counts. If the code is elsewhere, stop and rerun this audit on it.

### Phase 1 — Fix the active safety contradiction

Make the orchestrator document worker use the canonical pipeline and artifact boundary. Create the stable artifact at dispatch time, add deterministic fallback completion, check plan/case revision before save, and sync the Living File.

### Phase 2 — One logical artifact

Put workspace drafts and documents behind one stable artifact API and one UI state machine. Add immutable history from first edit. Do not physically merge tables until behavior is stable and access controls are proven.

### Phase 3 — One client information architecture

Adopt Overview, Messages, Documents, and Case details. Remove architectural terminology, duplicate status bands, and competing next-action systems from the client surface.

### Phase 4 — One attorney matter workbench

Unify associate context and proposal semantics across document, strategy, brainstorm, and consult tasks while preserving privilege boundaries.

### Phase 5 — Delete ghosts

Delete the verified unused scaffold, orphan modules, retired states, duplicate UI journeys, and stale design documents. Use telemetry and reversible redirects, but do not keep old implementations indefinitely “just in case.”

### Phase 6 — Automate and optimize

Only now optimize model routing, proactive generation, critic layers, job throughput, and admin repair automation.

---

## 10. Final decision

The product has a strong conceptual center and several thoughtful integrity and UX mechanisms. The client deck is calmer than the older wall-of-content model, and the attorney review workbench is meaningfully capable.

However, this checkout does not show the claimed post-audit simplification, and the newer planned-document worker introduces a more serious problem than ordinary dead code: it bypasses the very legal-generation and persistence safeguards the architecture says are canonical.

The next step should therefore not be another broad cleanup or visual redesign. It should be a proof-oriented consolidation of one complete journey:

> a nervous client tells an incomplete story, asks for a document, immediately sees one durable artifact, receives a complete and honest draft with explicit gaps, edits it, submits an immutable revision, and watches an attorney use one case-aware workbench to revise strategy and text without losing provenance—while the Living File converges after every accepted event.

When that journey passes real-database failure injection and human usability testing, the seven north stars will be more than architecture language. They will be observable product guarantees.

---

## Evidence index

- Product ownership and canonical-path claims: `artifacts/instant-attorney/docs/ARCHITECTURE.md`.
- Planned document dispatch: `lib/document-plan.ts`.
- Current direct document worker: `lib/document-job-worker.ts`.
- Worker trigger: `app/api/document-jobs/process/route.ts`.
- Chat planning, draft persistence, inline Living File parse, and background sync: `app/api/chat-acp/route.ts`.
- Durable conversation jobs and restart reconciliation: `lib/acp-jobs.ts`, `app/api/chat-acp/status/route.ts`.
- Canonical document persistence and Living File sync: `lib/document-persistence.ts`.
- Client case composition: `app/dashboard/[id]/page.tsx`, `components/ClientFileView.tsx`.
- Client navigation and next action: `lib/file-deck.ts`, `components/FileTiles.tsx`, `components/CaseHub.tsx`.
- Client documents and draft editing: `components/CaseDocumentsTable.tsx`, `components/ChatDraftsPanel.tsx`, `app/api/workspace/drafts/**`.
- Attorney case and brainstorm split: `app/attorney/file/[caseFileId]/page.tsx`.
- Attorney review workbench: `app/attorney/review/[id]/page.tsx`, `components/attorney-review/**`.
- Legacy and duplicate inventory: `pre_warmed`, `/wizard/`, roadmap, and freestyle references across `app`, `components`, and `lib`.
- Unused surrounding workspace packages: `pnpm-workspace.yaml`, `artifacts/api-server`, `artifacts/mockup-sandbox`, and root `lib/*` packages.

