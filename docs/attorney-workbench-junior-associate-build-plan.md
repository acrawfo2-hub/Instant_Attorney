# Attorney Workbench Junior Associate — Build Plan

**Status:** Product decisions confirmed; implementation not started

**Scope:** Attorney workbench only

**Objective:** Make the workbench chat the conversational control plane for document analysis, specialist review, and attorney-directed editing without replacing the canonical editor, structured findings, revision history, or attorney judgment.

## 1. Confirmed product decisions

1. **Discussion is the default.** The associate may answer, analyze, identify tradeoffs, and recommend language without changing the document.
2. **Edits require clear intent.** An edit happens only when the attorney explicitly requests it or confirms a proposed change. Small, unambiguous edits may be confirmed and applied as a group; broad or document-wide edits require a preview.
3. **Specialist shortcuts run immediately.** Buttons for Adversarial review, Full QA, Placeholders & execution, Formatting & filing, Authorities, and Explain / second opinion create a visible attorney instruction, invoke the relevant specialist, and report progress and results in chat.
4. **Phase 1 formatting only.** Support general legal-document formatting and the existing federal pleading baseline. If the forum, instrument, controlling rule, or confidence is insufficient, highlight the uncertainty to the attorney and identify what must be confirmed. Do not present generic guidance as validated compliance.
5. **Structured panels remain canonical.** Findings, citations, waivers, and run status continue to live in the existing structured panels. Chat is aware of those records, summarizes them, and can focus the relevant panel or act on them through existing server-side paths.
6. **Attorney judgment is never delegated.** AI may analyze, run checks, explain findings, and draft fixes. It may not waive a finding or citation, approve a document, or send it without explicit attorney action.
7. **The document is always visible and usable.** A blocking finding is a prominent warning, not a dead end. The attorney may still inspect, edit, download, approve, and send a draft after an explicit informed override. The product must retain the warning and the attorney's rationale in the audit trail.

## 2. Current-state assessment

The repository already contains most of the execution capabilities, but they are not unified behind chat:

- The workbench owns the editable working revision, autosave, immutable revision history, structured improvements, QA findings, citation review, approval, and delivery.
- The chat endpoint receives the current revision and matter context and returns exact before/after replacements.
- The chat currently requires at least one matchable replacement. It therefore cannot reliably provide analysis-only answers or invoke existing review and QA operations.
- Successful chat replacements currently apply immediately, despite UI copy saying that changes remain proposals.
- The review orchestrator can run an adversarial pass and generate structured improvements.
- QA already supports factual consistency, completeness, defined terms/cross-references, blanks/execution blocks, formatting/court requirements, client comprehension, and authorities.
- The formatting registry is deliberately narrow. Its only curated entry is a federal pleading baseline; other cases use official-source research fallback and must disclose when compliance could not be validated.
- Approval and delivery currently have hard blocking behavior for unresolved citations. That conflicts with the confirmed product policy and must become a deliberate attorney override rather than an absolute prohibition.

## 3. Target experience

### 3.1 Stable three-part workbench

The screen should maintain three persistent concepts:

1. **Matter context** — client, facts, sources, gaps, jurisdiction, and cover sheet.
2. **Document** — the primary object, continuously visible in the center editor and never replaced by a chat result, loading screen, finding list, or modal.
3. **Junior associate** — the right-side conversation and specialist controls.

On narrower screens, the document remains the default visible surface. Context and chat may become drawers or tabs, but specialist progress must not cover or navigate away from the working draft.

### 3.2 Chat modes without a mode switch

The attorney should not have to choose a formal mode. The server classifies each turn into one of these intents:

- **Discuss:** answer a question; do not mutate the document.
- **Review:** run or explain a specialist; write canonical findings, not document text.
- **Propose edit:** return one or more previewable changes.
- **Apply confirmed edit:** send a previously previewed, still-current change through the canonical revision endpoint.
- **Navigate:** focus a finding, citation, passage, revision, or structured panel.
- **Privileged action request:** prepare an approval, send, or waiver confirmation, but never execute it from a conversational inference.

Ambiguity resolves to the least destructive intent. For example, “What do you think about section 4?” is discussion; “Rewrite section 4 to narrow the indemnity” is an edit proposal.

### 3.3 Specialist action row

Place a compact, always-available action row above the chat composer:

| Shortcut | Canonical capability | Chat behavior |
|---|---|---|
| Adversarial review | Review orchestrator | Starts/re-runs the review, reports stages, summarizes structured improvements, and offers to explain or fix selected items. |
| Full QA | All QA check types | Runs all checks against the current revision and summarizes open, blocking, uncertain, and clean results. |
| Placeholders & execution | Blanks/execution plus completeness | Finds unresolved placeholders, missing terms, signature/notary/execution issues, and facts already available in the file that could fill blanks. |
| Formatting & filing | Formatting/court requirements | Applies Phase 1 baseline; clearly labels assumptions, missing forum information, unvalidated local requirements, and official sources consulted. |
| Authorities | Authorities gate | Verifies citations, exposes source links and verdicts, and highlights unresolved authorities without silently removing them. |
| Explain / second opinion | Analysis only | Critiques a selected passage or active finding without editing. If nothing is selected, asks what the attorney wants examined. |

Each click adds a normal, visible user message such as “Run placeholders and execution review against the current revision.” The response is part of the persistent thread, includes a run status card, and remains conversationally referable (for example, “Fix findings 2 and 4”). Buttons should disable only when the same incompatible operation is running, not disable the editor.

### 3.4 Editing interaction

Use the following safety tiers:

- **Analysis only:** no change controls.
- **Focused proposal:** show a grouped before/after diff with Apply, Modify, and Dismiss. Do not apply on response arrival.
- **Broad rewrite:** show a short plan and affected sections first. After confirmation, produce a grouped diff; the attorney still confirms application.
- **Explicit deterministic micro-edit:** a request such as “Change every defined use of Buyer to Purchaser” may return a grouped diff ready for one confirmation. It must not silently apply.

Application must verify that the proposal's base revision is still current. If not, rebase safely or mark it stale and regenerate. Accepted edits continue through the existing single attorney revision write path so revision provenance and Living File synchronization are preserved.

### 3.5 Findings, warnings, and informed override

The system should distinguish:

- **Blocking:** material legal, factual, execution, authority, or filing risk.
- **Warning:** meaningful concern that does not ordinarily prevent use.
- **Uncertain / unvalidated:** the system lacks enough information or an authoritative rule to reach a reliable conclusion.
- **Advisory:** style, clarity, or preference.

Blocking items must be visually prominent in chat, in the canonical panel, and near approval/delivery controls. They must never hide the draft or make the editor read-only.

For approval or delivery with unresolved blocking items:

1. Keep the normal action available with warning styling and a count of unresolved items.
2. Open a confirmation summary listing each unresolved blocker and its evidence.
3. Require the attorney to enter or affirm a reason for proceeding.
4. Record the attorney, revision identifier, blockers, rationale, and timestamp.
5. Proceed using the existing approval/delivery boundary.
6. Retain the findings as “overridden for this revision,” not falsely “resolved” or “AI verified.”

This is an informed professional override, distinct from a citation waiver. Waiver means the attorney independently resolved the substantive question; override means the attorney knowingly proceeded while the warning remained.

## 4. Technical design

### 4.1 One orchestrator, existing specialists

Refactor the junior-associate endpoint from an edit-only model response into a small server-side tool orchestrator. Do not create parallel implementations of review, QA, authorities, revisions, approval, or delivery.

Suggested tool contract:

- `get_workbench_state()` — current revision id/hash, selection, open findings, citations, active runs, matter metadata, and available sources.
- `run_adversarial_review()` — existing review-run service.
- `run_document_qa(checkTypes)` — existing selected-QA service.
- `get_review_results()` — canonical improvements, findings, citations, and check-run freshness.
- `propose_document_changes(changes, baseRevision)` — validates exact anchors and returns a persisted proposal; does not write document text.
- `focus_workbench_item(type, id)` — returns a client navigation event.
- `prepare_privileged_action(action)` — returns blockers and confirmation requirements; never executes the action.

Tool calls should occur server-side with authorization and document ownership checks. The model chooses among allowlisted tools; it receives no general database or write tool.

### 4.2 Unified response envelope

Replace the current “message plus mandatory changes” response with a discriminated response capable of discussion, progress, findings, proposals, and UI navigation:

```ts
type AssociateResponse = {
  message: string;
  operation?: {
    id: string;
    kind: "adversarial_review" | "qa" | "formatting" | "authorities";
    status: "queued" | "running" | "complete" | "failed";
  };
  findingRefs?: Array<{ type: "improvement" | "qa" | "citation"; id: string }>;
  proposal?: {
    id: string;
    baseRevisionId: string;
    scope: "focused" | "broad";
    changes: Array<{ before: string; after: string; summary: string }>;
  };
  uncertainty?: Array<{ issue: string; needed: string; impact: string }>;
  uiEvents?: Array<{ type: "focus"; targetType: string; targetId: string }>;
};
```

Use runtime validation for both model output and route input. Free-form model text must never directly become a tool call, status change, waiver, approval, delivery, or document write.

### 4.3 Persistent conversation awareness

Chat awareness must come from canonical data, not only from the prose transcript:

- Store tool invocation/result references and proposal identifiers alongside messages, either as structured metadata on the message or in an associated event table.
- On every turn, hydrate a compact workbench state: current revision, active/latest runs, open findings, citation verdicts, selection, stale-result indicators, and unresolved overrides.
- Refer to stable finding ids and displayed sequence numbers so “fix item 2” resolves deterministically.
- Mark old chat summaries stale when the working revision changes; never imply that a prior QA run covers a newer revision.
- Persist progress/results so a reload restores both the conversation and specialist state.

### 4.4 Formatting Phase 1

Phase 1 should not attempt a comprehensive jurisdiction registry. It should:

- Preserve the current curated federal pleading baseline.
- Add general document-structure checks appropriate to the known instrument family: headings, definitions, cross-references, numbering, signature/execution structure, exhibit references, internal consistency, and renderability.
- Use known matter jurisdiction and document identity; never infer an exact court from a broad location.
- When court-specific validation is requested and the forum is absent, return an `uncertainty` item asking for the controlling court.
- When official-source fallback cannot establish the rule, label the result “not validated,” explain the practical impact, and keep it visible as an uncertain finding.
- Separate content correctness from rendered-output correctness. Phase 1 may inspect source text and generation metadata; pixel/page-level `.docx` validation should be scoped as a later enhancement unless existing renderer tests can establish the requirement deterministically.

### 4.5 Concurrency and freshness

- Specialist runs bind to a revision id/hash.
- The editor stays enabled during analysis runs.
- If the attorney edits while a run is active, finish the run but label its result stale and offer “Re-run affected.”
- Applying a proposal requires an unchanged base revision or an explicit rebase preview.
- Only one run of a given specialist/revision combination should execute at once; return the existing run rather than duplicate spend.
- Long operations need durable status and polling or streaming; a browser disconnect must not lose the canonical run.

### 4.6 Authorization and audit

- Retain attorney-role checks on all workbench and tool endpoints.
- Attribute user messages, tool triggers, proposal confirmations, edits, waivers, overrides, approvals, and sends separately.
- Record AI provider/model and usage through the existing usage tracker.
- Do not treat the AI as the actor for attorney-confirmed privileged actions.
- Preserve the distinction among finding resolution, attorney waiver, and informed override.

## 5. Delivery plan

### Workstream 0 — Contract tests and product language

1. Add characterization tests for the existing review, QA, revision, approval, and delivery boundaries before refactoring chat.
2. Define the intent taxonomy, response envelope, proposal freshness rule, specialist labels, severity language, and override semantics.
3. Correct contradictory chat copy as part of the first functional slice, not as an isolated cosmetic change.

**Exit criteria:** Existing canonical capabilities are pinned; discussion, proposal, apply, specialist, and privileged-action behaviors have explicit contracts.

### Workstream 1 — Analysis-first associate

1. Update the associate prompt and route so analysis-only responses are valid.
2. Add server-side intent classification with conservative fallback to discussion.
3. Stop applying returned changes on arrival.
4. Render grouped proposals with Apply, Modify, and Dismiss.
5. Bind proposals to the current revision and reject/rebase stale proposals.
6. Apply confirmed proposals through the existing revision route only.

**Exit criteria:** Questions never require a fake edit; no AI edit reaches the document without attorney confirmation; accepted edits retain revision history and Living File sync.

### Workstream 2 — Specialist tool orchestration

1. Add the six shortcut buttons and visible generated instructions.
2. Expose allowlisted server tools that call existing review/QA/authority services.
3. Show queued/running/complete/failed operation cards in chat.
4. Hydrate canonical findings into subsequent chat turns.
5. Add finding references and focus events linking chat summaries to existing panels and passages.
6. Support follow-ups such as “explain,” “fix selected,” and “what remains blocking?”

**Exit criteria:** Every shortcut uses the existing canonical service, results survive reload, and chat can accurately discuss the latest structured result without duplicating it.

### Workstream 3 — Phase 1 formatting and uncertainty

1. Add general instrument-format checks while retaining the federal pleading baseline.
2. Make missing forum and unvalidated controlling requirements first-class uncertain findings.
3. Require official-source attribution when fallback research succeeds.
4. Present assumptions, confidence limitations, and information needed in both chat and the formatting panel.
5. Add tests for broad jurisdiction, missing jurisdiction, unsupported document type, unavailable controlling rule, and clean federal pleading baseline.

**Exit criteria:** The UI never claims court compliance without adequate support, and the attorney always sees what is unknown and why it matters.

### Workstream 4 — Advisory gates and attorney override

1. Replace hard-disabled approval/delivery controls with warning-aware actions.
2. Add the unresolved-blocker confirmation summary and required rationale.
3. Persist revision-bound informed overrides as audit events.
4. Keep unresolved items visible after override and distinguish override from resolution/waiver.
5. Ensure chat may summarize blockers and prepare the confirmation but cannot confirm it.
6. Verify the document editor, preview, revision history, and download remain available throughout.

**Exit criteria:** No automated finding can make the draft disappear or become unusable; an attorney can proceed after an explicit, attributable acknowledgment; the AI cannot bypass that acknowledgment.

### Workstream 5 — Resilience, accessibility, and observability

1. Add idempotency for specialist starts and proposal application.
2. Add durable recovery for refresh/disconnect during long runs.
3. Add keyboard and screen-reader behavior for shortcuts, progress, proposal diffs, focus events, and confirmations.
4. Track specialist use, latency, failure, token cost, proposal acceptance, stale results, overrides, and post-override sends.
5. Add end-to-end coverage for desktop and narrow layouts, with the document remaining visible/default.

**Exit criteria:** Runs recover safely, duplicate clicks do not duplicate work or writes, all critical interactions are accessible, and operational failures are measurable.

## 6. Test plan

### Unit and contract tests

- Intent classification defaults ambiguous prompts to discussion.
- Analysis responses require no `changes` array.
- Tool arguments and model responses reject unknown operations and malformed identifiers.
- Each shortcut maps to the correct existing service/check types.
- Proposal application requires attorney confirmation and a current base revision.
- Findings hydrate into follow-up context by stable id.
- A new revision makes prior specialist summaries stale.
- Formatting uncertainty is emitted for missing forum or unestablished rules.
- Approval/send execution rejects AI-only confirmation and accepts an authenticated attorney override with rationale.

### Integration tests

- Ask a question, receive analysis, and verify no document write.
- Request an edit, receive a preview, modify it, confirm it, and verify exactly one canonical revision write.
- Run every specialist from chat and verify canonical panel records rather than duplicate findings.
- Refresh during a run and recover progress plus transcript.
- Edit during QA and verify stale labeling plus affected re-run.
- Attempt approval with blockers, cancel, and verify nothing changes.
- Proceed with blockers, enter rationale, and verify approval/delivery plus immutable audit data.
- Confirm unresolved warnings remain visible after proceeding.

### End-to-end acceptance scenarios

1. “What is weak about this indemnity?” returns a discussion, not an edit.
2. “Narrow it to third-party claims” returns a diff; the draft changes only after confirmation.
3. Clicking **Adversarial review** creates a chat operation and structured improvements; “fix 2 and explain 3” resolves the correct records.
4. Clicking **Placeholders & execution** identifies genuine gaps but also notices values already present in the file.
5. Clicking **Formatting & filing** with no exact court prominently says validation is incomplete and asks for the court.
6. A blocking authority remains visible, but the attorney can inspect and edit the whole draft.
7. The attorney may approve/send with that blocker only after an explicit rationale; chat cannot perform the confirmation.
8. At every stage—including loading, failures, confirmation, and narrow viewport—the current document remains reachable and is never replaced by the specialist experience.

## 7. Rollout and measurement

Use a feature flag for the orchestrated associate and deploy in slices aligned with the workstreams. Keep the existing QA panels and direct buttons available during rollout as a fallback.

Monitor:

- percentage of chat turns classified as discussion, specialist, or edit;
- proposal acceptance/modification/dismissal rates;
- specialist completion, failure, and duplicate suppression;
- stale-run frequency after concurrent editing;
- formatting results marked validated versus uncertain;
- blocker override frequency and rationale completion;
- approval/send outcomes after override;
- token cost and latency by specialist;
- any document write not associated with typing or explicit proposal confirmation (target: zero).

## 8. Explicitly out of scope

- A comprehensive state/local-court formatting registry.
- Autonomous waiver, approval, or client delivery.
- Replacing structured findings with transcript-only prose.
- A second document write path owned by chat.
- Hiding or locking the document because an automated check failed.
- Silently fixing, removing, or waiving an authority.
- Treating uncertain formatting guidance as verified legal compliance.

## 9. Definition of done

The initiative is complete when an attorney can converse naturally with one junior associate, invoke each specialist from chat, ask follow-up questions about canonical results, preview and confirm edits, and proceed in the face of clearly disclosed blockers through an auditable attorney override—while the active document remains continuously visible, editable, downloadable, versioned, and under the attorney's control.
