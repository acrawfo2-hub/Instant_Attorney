# Client Landing Simplification Audit

**Date:** August 13, 2026

**Scope:** The authenticated client case landing page and the client-facing code and destinations that exist to support it. Attorney-only capability is identified but not audited for removal.

**Deliverable:** Audit and recommendations only. No application code, schema, or runtime behavior was changed.

---

## Executive decision

The restored cover-sheet direction is correct, but the current client landing page is not yet the simplest expression of the seven North-Star principles.

The page currently presents four layers at once:

1. conditional warning and consult strips;
2. a four-part case memo;
3. a second, separate “Your documents” list;
4. eight permanent destination tiles, plus persistent header and mobile actions.

Several of those layers intentionally repeat access to the same facts, risks, documents, attorney state, and next actions. That is acceptable—and useful—when one layer is an activity-ranked shortcut and the other is the stable file map. The implementation risk is not the repeated button; it is allowing “Your documents,” “Drafted documents,” “Attorney review,” or “Uploads” to develop different records or status rules, allowing “What may work against you” and “Other side’s position” to disagree, or allowing the Attorney tile, consult strip, and header consult button to read different consult state.

**Revised recommendation:** keep the requested cover-sheet contract intact. The following are deliberate, permanent parts of the regular client homepage and are **not deletion candidates**:

1. the cover-sheet action area with one primary next step and up to two secondary actions, each seeding Legal chat through `ask=`;
2. “Your documents,” showing up to three named current documents and “See all”;
3. all eight stable tiles—Drafted documents, Attorney review, Uploads, Facts, Other side’s position, Financial vault, Key dates, and Attorney;
4. Legal chat, Money & property, and consult in the regular-client header; and
5. the sticky Continue legal chat control on phones.

The duplication in this design is intentional wayfinding rather than redundant product scope: the document shortcuts answer “where is the paper I was just working on?”, while the stable tile map answers “where does this kind of information always live?” The audit should therefore simplify the implementations and destination interiors **behind** this fixed homepage, not collapse or remove its visible map.

This remains a recommendation to simplify client code without deleting legal safeguards or the attorney workbench. The appropriate targets are parallel data identities, repeated computation, oversized components, duplicate network loading, orphaned routes, and specialist journeys that do not support any homepage destination—not the agreed cover page itself.

---

## The test applied

Every client-facing item was required to answer all four questions:

1. **Which North-Star principle does it directly support?**
2. **What unique client job does it perform that no other visible item performs?**
3. **Would removing it prevent a client from starting, finishing, finding, editing, submitting, or understanding the status of legal work?**
4. **If it mainly serves attorneys or internal operations, why is it exposed as a first-class client destination?**

The recommendation labels mean:

- **KEEP** — unique, necessary client value; preserve the capability and its visible place.
- **KEEP, SIMPLIFY** — necessary capability, but the current presentation or implementation carries avoidable complexity.
- **MERGE** — necessary information or action, but not a separate client concept.
- **CONDITIONAL** — justified only when supported by case data, matter type, an attorney request, or an active workflow.
- **REMOVE FROM CLIENT** — may remain for attorneys or as an orchestrator tool, but should not be a client landing destination.
- **DELETE AFTER PROOF** — code appears redundant for the client flow, but removal must follow reachability, telemetry, retention, and attorney-flow checks.

This audit does not equate “not visible on the landing page” with “delete the data or domain service.” Simplicity means one client concept per job while preserving the controls that prevent loss, fabrication, and stale case context.

---

## North-Star mapping

| Principle | Minimum client-side expression | Complexity it does **not** justify |
|---|---|---|
| Patient intake from an incomplete story | One case-aware conversation; explicit “I don’t know”; confirmed facts and open questions; resumable work | Separate client modes, specialist journeys, or multiple places to ask the assistant |
| Every drafting request produces a finished artifact | Immediate artifact identity; complete editable structure; conspicuous blanks/deficiencies; recoverable status | Separate “workspace draft” and “document” mental models, or an empty failed shell presented as a draft |
| Documents are always findable | One canonical artifact inventory exposed through Your documents and the relevant stable tiles; one card per artifact; plain-language status and next action | Separate storage identities, lifecycle rules, and polling systems behind those entry points |
| Editing never destroys history | Autosave clarity; immutable versions; submitted original preserved; archive rather than destructive deletion | Exposing internal promotion, parent-document, or revision implementation nouns |
| Attorney has a case-aware AI junior associate | Client sees attorney handoff, questions, decisions, and accepted changes | Exposing attorney AI rooms, brainstorm surfaces, QA controls, or work-product machinery to clients |
| Living File always stays current | A visible saved/sync state and one durable case-event boundary behind every accepted input | Multiple client summaries computed by different engines or repeated semantic update paths |
| System never invents certainty | Source/provenance, “unconfirmed,” deficiency, jurisdiction, readiness, and approval labels | A persuasive “strength score,” deadline, or summary shown without its limits and source state |

---

## Audit of the current landing page

### A. Header

| Current item | Unique client job | North-Star support | Decision | Why |
|---|---|---|---|---|
| Matter switcher / “All matters” | Move between a client’s files | Findability | **KEEP** | Multi-matter support is real and this is the least surprising place for it. Keep it compact and do not duplicate it in the body. |
| Legal chat | Return to the patient case-aware assistant | Intake; Living File | **KEEP** | This is the primary way to add an incomplete story, ask for work, and resolve uncertainty. Use one label everywhere: “Case assistant” or “Continue legal chat.” |
| Money & property | Open the same secure Financial vault available in the tile map | Facts/drafting; findability | **KEEP FOR REGULAR CLIENTS** | The header shortcut is part of the desired contract. Reuse exactly the same vault route, authorization, state, and terminology as the tile so the second entry point adds no second implementation. |
| Consult button | Start or manage live legal help | Attorney control; anti-certainty | **KEEP FOR REGULAR CLIENTS** | A live consult is materially different from AI assistance and is part of the desired header. Its label and destination may change with consult state, but the affordance remains. Reuse the same consult state machine shown behind Attorney. |
| Account menu | Account, billing, logout | Operational necessity | **KEEP** | It is global account chrome, not part of the case map. Keep visually quiet. |

### B. Status strips

| Current item | Decision | Justification and change |
|---|---|---|
| Jurisdiction / Local Counsel Prep warning | **KEEP** | This directly prevents invented authority and false geographic certainty. It must remain conspicuous whenever full-depth jurisdiction support is unavailable. It may be compact, but it must not be buried in Case file. |
| Pressing deadline alert | **KEEP** | A verified or explicitly derived urgent date deserves interruption. The strip must state its source/derivation and uncertainty; it should link to the same date record behind Key dates. |
| Consult status strip | **KEEP WHEN STATUS-BEARING** | The header button and Attorney tile are stable navigation; the strip communicates an active state that may need attention. All three must read one consult state selector so they cannot contradict each other. Hide only the strip when there is no meaningful status. |
| Post-consult summary strip | **MERGE INTO ATTORNEY HELP / CASE ACTIVITY** | The consult outcome belongs in durable case history and next actions. A permanent summary strip creates another version of “where things stand.” Use a temporary “new since last visit” notice, then retain the content in the file timeline. |

### C. “Your case at a glance” memo

| Memo section | Decision | Justification and change |
|---|---|---|
| Where you stand | **KEEP, SIMPLIFY** | This is the cover sheet’s core. Use one short, source-grounded case status, last-updated time, and uncertainty cue. Do not concatenate summary, strategy summary, and strength headline into a second synthesized narrative without provenance. |
| Important facts | **KEEP AS COVER-SHEET PREVIEW** | The short preview is part of the desired cover sheet; Facts remains the stable full destination. Both must derive from the same canonical fact set, and the preview must not omit a qualification that changes meaning. |
| What may work against you | **KEEP AS COVER-SHEET PREVIEW** | The short preview is an accelerator into the dedicated Other side’s position tile. Both must derive from the same stored strength check and preserve uncertainty; the preview must not turn analysis into fact. |
| What happens next | **KEEP** | This is the most important block on the page. It should be first, not the fourth quadrant. Permit one primary action and at most two secondary actions. Each must perform the task or open the exact artifact/input, rather than merely opening a generic chat when a direct action exists. |
| “See full summary, goals & strategy” | **KEEP AS COVER-SHEET “SEE MORE”** | Case details is deliberately not a ninth tile. The link preserves access to summary, goals, and strategy without disturbing the stable eight-button map. Keep the routed destination and its reachability test. |

### D. “Your documents” shortcuts

**Decision: KEEP as the activity-ranked document entry point alongside the stable document-related tiles.**

The shortcuts strongly support document findability and should remain above secondary reference material. They currently show only three items and then point to a broader table, which is reasonable if ordering is stable and the list includes every artifact type through one identity.

Required corrections before this section fully satisfies the principles:

- Create the visible artifact identity when drafting is accepted, not only when a worker later claims a job.
- Never label an empty shell “Started — nothing written yet” as the completed response to a drafting request. A failure must leave a structurally complete fallback with conspicuous deficiencies.
- Use one artifact card and one stable identity across drafting, client edits, submission, attorney revision, approval, delivery, and archive.
- Display the latest working version while preserving the exact submitted original and prior revisions.
- Do not expose whether the record lives in `client_workspace_drafts`, `documents`, child documents, forms, or attachments.
- Make the card’s next action explicit: Open, Fill details, Review changes, View submitted version, Retry generation, or Download final.

Once this is done, the document shortcuts and three document-related tiles are justified parallel entry points over one canonical artifact inventory. None should be removed from the homepage.

### E. Eight permanent tiles

**Product decision: KEEP ALL EIGHT, in the same order, on every client case homepage.**

| Tile | Why its permanent place is justified | Simplification recommendation |
|---|---|---|
| Drafted documents | Gives a learned, stable route to every draft and document even when the three-item shortcut changes with activity | **KEEP.** It and “Your documents → See all” must open the same canonical document table and artifact identities. |
| Attorney review | Lets a client answer “what is currently with the attorney?” without interpreting document statuses | **KEEP.** Implement as a filtered/focused view of the same artifact library, not a second review store or list. |
| Uploads | Makes both received evidence and outstanding requests predictably findable | **KEEP.** Use the same attachment/request records as Documents and next actions; do not build a parallel upload inventory. |
| Facts | Provides a stable home for confirmed facts and open gaps | **KEEP.** Preserve provenance and uncertainty categories, and derive cover-sheet summaries from this same canonical fact set. |
| Other side’s position | Gives adversarial/strength analysis an explicit, client-understandable home | **KEEP.** Reuse the same stored strength check and label it analysis, not fact or legal certainty. |
| Financial vault | Makes sensitive money and property records consistently reachable | **KEEP.** The tile and header shortcut must resolve to the same secured route and state. A separate route is justified by the focused workflow and privacy boundary. |
| Key dates | Gives deadlines a predictable home even before a deadline becomes urgent | **KEEP.** Reuse deterministic docket output; urgent dates may also appear as an alert and next action without creating another date model. |
| Attorney | Gives contact, existing-counsel information, consult help, and attorney assessment one learned home | **KEEP.** Reuse the same counsel and consult state as the header and any status strip. |

The tile map is a stable index, while cover-sheet actions and document shortcuts are activity-ranked accelerators. Keeping both is justified so long as they share routes, selectors, records, status vocabulary, and authorization rather than duplicating implementation.

### Required steady-state landing page

```text
Case header:
  All matters / matter switcher | Legal chat | Money & property | Consult | account

[Jurisdiction, deadline, or consult-status strip when applicable]

Cover sheet: Your case at a glance
  Where you stand
  Important facts
  What may work against you
  What happens next
    One primary action
    Up to two secondary actions
    Actions seed Legal chat with ask=
  See full summary, goals & strategy

Your documents
  Up to three current documents by name
  Empty-state promise when none exist
  See all → full document table

Eight stable tiles, always in this order:
  Drafted documents | Attorney review | Uploads | Facts
  Other side’s position | Financial vault | Key dates | Attorney

Mobile: sticky Continue legal chat
```

The simplification invariant is **one implementation behind multiple intentional entry points**. For example, the header’s Money & property and Financial vault tile may both exist, but they must share one route and secured data model. “Your documents,” Drafted documents, Attorney review, and Uploads may all exist, but they must be projections of one artifact inventory rather than four lifecycle systems.

---

## Client-side code justification register

This register distinguishes **client value** from **current code shape**. “Merge” does not authorize deleting a module until its attorney consumers and tests are checked.

| Current code/capability | Client justification | Attorney dependency | Recommendation |
|---|---|---|---|
| `app/dashboard/[id]/page.tsx` | Authenticated file entry, ownership-scoped data, matter switching, client chrome | The component can render attorney mode elsewhere, but this route is client-oriented | **KEEP, SIMPLIFY QUERY.** Fetch landing summary and action-ranked documents first. Lazy-load destination-specific data rather than loading every fact, document, form, attachment, consult, and workspace draft on every arrival. |
| `components/ClientFileView.tsx` | Composes client landing and detail views | Also composes the attorney file layout | **SPLIT BY ROLE.** Keep a small client cover-sheet component and a separate attorney file component. Shared domain selectors may remain shared. A 647-line role branch makes client deletion risky because attorney dependencies are interleaved. |
| `components/ClientCaseMemo.tsx` | Required cover sheet: standing, important facts, adverse preview, and one primary plus up to two secondary actions | None found outside client view | **KEEP THE FULL CONTRACT.** Simplify its inputs so every preview is selected from canonical facts/strategy/tasks; protect `ask=` seeding and the case-details “see more” link with tests. |
| `components/FileTiles.tsx` | Renders the required permanent eight-item map | None found outside client view | **KEEP.** Protect fixed membership, order, accessible labels, and route reachability with tests. Simplify only its styling or icon implementation if behavior remains identical. |
| `lib/client-destinations.ts` | Validates routed client detail views and the cover-sheet “see more” route | None | **KEEP.** Preserve all current destinations: documents, deadlines, case-details, facts, strength, and help. The Financial vault remains its focused child route. Add a test that every tile and “see more” link resolves. |
| `lib/file-deck.ts` | Ranks urgent dates, next actions, findable artifacts, and constructs the stable tile map | Client-focused | **KEEP AS THE CANONICAL HOMEPAGE VIEW MODEL.** Preserve `buildTiles`, fixed ordering, action ranking, document shortcuts, and shared statuses. Simplify duplicated computation around it, not the public result. |
| `lib/matter-tasks.ts` | Converts file state into actionable client work | Shares concepts with Mission Control | **KEEP AS ONE CANONICAL ACTION ENGINE.** It must remain deterministic, source-grounded, and artifact-aware. Eliminate any other client next-step engine rather than layering another summary over it. |
| `lib/mission-control.ts` + `components/MissionControlBoard.tsx` | No longer rendered on the client branch | Still rendered on the attorney branch and may support attorney prioritization | **REMOVE FROM CLIENT LANGUAGE; KEEP FOR ATTORNEY UNTIL SEPARATE AUDIT.** Do not delete solely because the client landing no longer uses the board. Consider sharing only the underlying task engine. |
| `components/CaseDocumentsTable.tsx` | One place to find drafts, forms, uploads, requests, review items, and final documents | Also supports attorney rendering paths | **KEEP CAPABILITY, DECOMPOSE UI.** It currently holds polling, upload, workspace edit, blank filling, promotion, forms, attachments, document state, and review in one 1,012-line client component. Create one artifact list contract and small type-specific actions; do not create separate destinations again. |
| `components/FactsPanel.tsx` | Complete confirmed/open fact view with document-attributed gaps | Useful to attorney file | **KEEP BEHIND FACTS.** Preserve provenance and distinguish missing, disputed, alleged, and hypothetical items; avoid flattening all uncertainty into “facts.” |
| `components/KeyDeadlines.tsx` + `lib/docket.ts` | Makes deadlines visible and deterministic | Critical to attorneys | **KEEP BEHIND KEY DATES.** Promote urgent dates to the cover sheet while leaving every computed date in the permanent destination. Never delete docket logic as a cosmetic simplification. Add source and confidence semantics if absent. |
| `components/StrengthCheckCard.tsx` | Explains weaknesses and likely counterarguments | Valuable attorney analysis and drafting context | **KEEP BEHIND OTHER SIDE’S POSITION.** The cover-sheet preview and full destination must use the same result. Keep generation/refresh controls away from the landing page and preserve clear “analysis, not certainty” language. |
| `components/LegalStrategyCard.tsx` | Client-readable strategy | Attorney has a richer strategy view | **MERGE INTO CASE FILE.** Strategy is justified content, not another cover-sheet preview or independent client journey. |
| `components/ExistingCounselCard.tsx` and counsel form/modal | Records existing representation and engagement goal | Critical for conflicts, scope, and attorney context | **KEEP BEHIND ATTORNEY.** It has legal significance and is explicitly part of that stable tile destination. |
| `components/AskAssistantBar.tsx` | Keeps patient intake and follow-up reachable on mobile | No deletion concern | **KEEP AS STICKY CONTINUE LEGAL CHAT.** It and the header Legal chat action must open the same case-aware conversation. |
| `components/FileAlertStrip.tsx` | Interrupts for a real urgent deadline | Attorney receives dates elsewhere | **KEEP CONDITIONALLY.** It must be driven by deterministic file data, be dismissible only in a way that preserves the deadline, and avoid repeating the same alert on every surface. |
| Financial picture route/components | Collects structured assets, debts, income, and property | Important to matter-specific attorney analysis/drafting | **KEEP AS THE FINANCIAL VAULT.** Preserve its focused secure route and both permanent client entry points; simplify only duplicated loaders, labels, or state. |
| Government form detection and `/forms/[id]` | Connects a matter to an official instrument and guides completion | Useful for attorney review | **KEEP AS DOCUMENT BEHAVIOR.** It belongs inside the unified artifact list, with source/version verification; it does not justify a separate landing destination. |
| Attachments, requested attachments, upload/scan UI | Evidence intake and fulfillment of requested items | Essential to attorney evidence review and Living File updates | **KEEP BEHIND UPLOADS AND DOCUMENTS.** Outstanding requests become next actions and remain visible behind Uploads; stored files use the canonical artifact inventory. The stable Uploads destination remains. |
| `client_workspace_drafts` client experience | Editable work appears before promotion | Attorney receives promoted documents | **MERGE LIFECYCLE.** Preserve data until a migration proves identity/history equivalence, but stop exposing two artifact classes. Long term, one stable artifact should change state rather than be promoted into a second identity. |
| Consult components and routes | Human escalation, scheduling, session, wrap-up | Core attorney service workflow | **KEEP WITH ALL REQUIRED ENTRIES.** Header consult, status strip when meaningful, and Attorney tile must share one state machine. Do not delete the attorney session/wrap-up system in a client simplification. |
| Self-service specialist pages and calculators | Can answer a narrow question | Some deterministic calculations may support attorney strategy | **REMOVE FROM PRIMARY CLIENT FLOW; AUDIT INDIVIDUALLY.** A tool survives only with a named owner, applicable jurisdiction, maintained authority, unique decision/output, usage, and an orchestrator/attorney consumer. Otherwise archive/delete the page wrapper and retain only proven domain logic. |
| One-off question / free chat | Answers something without a durable case file | Little attorney benefit because context is intentionally absent | **MEASURE, THEN DELETE OR CONSTRAIN.** It conflicts with Living File currency and document findability if it can produce case-relevant advice or drafts. Keep only as a clearly bounded acquisition/demo surface that cannot draft, imply case awareness, or strand legal facts outside a file. |
| `What-If Game` and hypothetical facts | Captures contingency preferences | Can inform attorney drafting | **REMOVE AS A SEPARATE CLIENT PRODUCT.** Keep hypothetical status and provenance; collect contingency preferences conversationally or within the relevant document. The playful name risks understating legal consequences. |

---

## What must not be deleted in the name of client simplicity

The following complexity justifies its existence because removing it would violate a North Star or a legal/safety boundary:

- ownership checks, authentication, authorization, RLS, privilege boundaries, and role separation;
- immutable document revisions, submitted originals, provenance, comparisons, accepted/rejected attorney proposals, and audit events;
- durable ACP/document jobs, idempotency, retry/reconciliation, and visible sync status;
- marker/completeness validation, deterministic fallback documents, conspicuous placeholders, and structured deficiencies;
- jurisdiction and governing-law gates, authoritative-source verification, readiness labels, and attorney-approval state;
- attachment retention, legal hold, malware/file validation, source identity, and extraction status;
- deterministic docket calculation and traceable deadline sources;
- the Living File update queue and a repair path for failed semantic updates;
- the attorney’s case-aware workbench, even if its controls disappear from client navigation.

The simplification target is duplicate **interfaces, models, and pathways**, not safeguards.

---

## Recommended simplification order

### Phase 0 — Lock the homepage contract

1. Add a contract test for all eight tiles, their fixed order, labels, destinations, and empty-state presence.
2. Add tests for the three-document shortcut, “See all,” the case-details “see more” link, `ask=` action seeding, regular-client header actions, and sticky mobile Legal chat.
3. Verify every intentional duplicate entry point resolves to the same canonical route and authorized records.
4. Instrument destination opens and completion—not to decide whether required buttons survive, but to find confusing interiors and unused secondary functionality.

### Phase 1 — Consolidate behind the homepage without changing it

1. Define one artifact view model for workspace drafts, documents, forms, attachments, requests, and attorney-review state.
2. Make Your documents, Drafted documents, Attorney review, and Uploads projections/anchors over that model.
3. Define one fact/strategy model so the memo, Facts, and Other side’s position cannot disagree.
4. Define one docket selector for alerts, cover-sheet actions, and Key dates.
5. Define one consult/counsel selector for the header, consult strip, and Attorney tile.
6. Ensure both Money & property entry points use the same secure Financial vault route.

### Phase 2 — Simplify implementation boundaries

1. Split `ClientFileView` into client and attorney compositions while preserving the exact client contract.
2. Decompose `CaseDocumentsTable` behind the single artifact view model without splitting it into new stores or routes.
3. Fetch a compact homepage projection on arrival and destination-specific details when opened, while preserving server-rendered statuses and no-JS links where required.
4. Centralize status labels, counts, and destination construction in `file-deck` so shortcuts and tiles remain consistent.

### Phase 3 — Delete only code that does not support the contract

1. Migrate parallel workspace/document identities into one durable artifact lifecycle only after preserving links, history, submissions, and attorney provenance.
2. Delete promotion-only code after migration and equivalence tests—not the document shortcuts or tiles.
3. Audit specialist pages and standalone journeys individually. Delete only those with no tile, cover-sheet, Legal chat, artifact-generation, Living File, or attorney-workbench consumer and no named legal owner.
4. Retire internal client-facing nouns such as “intake/freestyle,” “workspace draft,” “promoted,” “child document,” and “pre-warmed,” while retaining the agreed public labels.

---

## Product decisions now treated as fixed

| Decision | Locked answer | Architectural consequence |
|---|---|---|
| Must the eight tiles always be present? | **Yes.** | Preserve membership, order, destinations, live status, and empty states. |
| Is attorney review a destination? | **Yes.** | Implement it as a focused projection of the canonical document inventory. |
| Is upload a destination? | **Yes.** | Combine received attachments and outstanding requests behind the Uploads anchor without duplicating records. |
| Is Other side’s position client-visible? | **Yes.** | Keep the dedicated strength-check destination and explicit uncertainty language. |
| Is the Financial vault universal for regular clients? | **Yes.** | Keep both header shortcut and tile, sharing one secure route. |
| Should case details remain a “see more” link rather than a ninth tile? | **Yes.** | Preserve the `case-details` routed destination and reachability test. |
| Should every regular client see Legal chat and consult in the header? | **Yes.** | Keep both; status may alter consult labeling/destination but not remove the affordance. |
| Should phones retain sticky Continue legal chat? | **Yes.** | Preserve mobile positioning and accessibility. |
| Can one-off chat draft or retain case facts outside a file? | **No.** | Constrain it or persist work into a case so findability and Living File currency hold. |
| Can a failed drafting job leave an empty shell? | **No.** | It must yield a structured, editable fallback with conspicuous deficiencies. |

---

## Acceptance criteria for the simplified client landing page

The simplification is successful only when all of these are true:

1. A client can state an incomplete story, say “I don’t know,” leave, return, and continue without selecting an internal mode.
2. The cover sheet has one primary next action and no more than two secondary actions, and each seeds Legal chat through `ask=`.
3. Every drafting request immediately creates one findable artifact; timeout or malformed output still yields a complete structured fallback with explicit deficiencies.
4. A client can locate any current draft, upload, form, submitted version, attorney-reviewed version, or final file through Your documents and the appropriate stable tile, with both resolving to the same underlying artifact.
5. The same artifact never appears as two current records because it crossed an internal promotion boundary.
6. Each artifact shows plain-language status and the exact next action.
7. Client and attorney edits preserve earlier versions and the submitted original; deletion is archive/trash subject to retention rather than silent destruction.
8. Case file content distinguishes confirmed fact, client allegation, opposing position, inference, hypothetical preference, missing information, and attorney opinion.
9. Every accepted input visibly saves or shows a durable queued/failed sync state.
10. Jurisdiction, legal authority, deadline source, filing readiness, document completeness, and attorney approval are never implied when unknown.
11. Every regular client sees Money & property in the header and Financial vault in the tile map; both open the same secured records.
12. Every regular client sees the consult header action and Attorney tile; any consult strip draws from the same state and cannot contradict them.
13. An attorney retains the case-aware AI workbench, proposal acceptance/rejection, revision history, QA, and privileged context even though those controls are absent from the client landing page.
14. All eight tiles remain present and ordered as specified, the case-details “see more” link remains available, and phones retain sticky Continue legal chat.
15. In usability testing, a first-time client can answer “What should I do?”, “Where are my papers?”, “What does the file say?”, and “How do I reach a lawyer?”, understanding that shortcuts are accelerators and tiles are the stable map.

---

## Final recommendation

**Do not delete the current landing-page contract or the legal capability behind it. Delete duplicated implementation underneath it.**

The code earns its keep when it produces one of four outcomes: a patient conversation, a complete and editable artifact, a current and traceable case file, or a controlled attorney handoff. The current deadline engine, fact provenance, document history, Living File queue, jurisdiction controls, upload handling, and attorney workbench all pass that test.

The fixed eight-tile map, document shortcuts, cover-sheet actions, header shortcuts, and sticky mobile chat **do** pass because they are the chosen client navigation contract. What does not yet pass is unnecessary machinery behind them: parallel artifact identities, repeated selectors and polling, inconsistent status vocabularies, one-off context that can escape the Living File, and standalone specialist journeys with no proven consumer.

The simplest defensible implementation is:

> **One canonical implementation per capability, exposed through the complete cover sheet and stable eight-button map the client expects—backed by durable history, current context, and explicit uncertainty.**
