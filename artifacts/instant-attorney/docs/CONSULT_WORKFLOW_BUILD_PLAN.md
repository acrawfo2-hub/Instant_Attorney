# Elite consultation workflow — build plan

**Status:** Product and engineering plan

**Decision date:** 2026-08-13

**Primary outcome:** A quiet, case-aware junior associate that prepares the attorney, listens during a browser-companion consultation, continuously organizes the record, and leaves two deliberately different drafts one click away.

**Initial jurisdictional posture:** Texas-first controls, with policy text and legal conclusions subject to firm counsel approval before release.

## 1. Decisions this plan implements

The product decisions are settled for the first release:

1. **Capture is a browser companion.** The attorney opens Instant Attorney beside a phone, in-person, Zoom, or Google Meet consultation. No meeting-joining bot is required.
2. **Conflict screening is system-assisted and human-cleared.** The system finds and ranks possible conflicts; an authorized reviewer records the decision. It never silently clears a matter.
3. **The first differentiator is the live junior associate.** Memo generation remains a fast, prominent action rather than the main live experience.
4. **The associate is quiet.** It continuously structures the consultation but interrupts the attorney only for a small number of high-value prompts.

The operating sequence is:

> parties → conflict decision → preparation → consent → live capture → structured record → engagement decision → internal report → client action memo → approved actions

Within a cleared consultation, the reasoning sequence is:

> facts → objectives → issues → options → decision → documented next action

## 2. What already exists, and what changes

This is an extension of the canonical consult path, not a new consult product.

| Existing capability             | Canonical owner today                                                         | Disposition                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Scheduling and consult identity | `consult_requests`                                                            | Keep as the consult aggregate and extend its lifecycle carefully.                                                         |
| Matter identity                 | `case_files` through the existing matter-routing boundary                     | Keep; never select a matter by recency or create a parallel consult matter.                                               |
| Preparation memo                | `lib/pre-consult-generate.ts` and `ConsultBriefPanel`                         | Evolve into a versioned preparation snapshot generated only after conflict clearance.                                     |
| Live session shell              | `ConsultSessionView`                                                          | Recompose into the consult cockpit rather than adding another session page.                                               |
| Timestamped private notes       | `consult_notes`                                                               | Keep; make notes one input to the structured record.                                                                      |
| Browser audio capture           | `ConsultRecorder`                                                             | Replace stop-then-transcribe behavior with resumable chunks and delayed near-live transcription.                          |
| Recording/transcript storage    | `consult_recordings`                                                          | Keep as immutable recording metadata; add segment-level transcript storage instead of repeatedly rewriting one text blob. |
| Existing wrap-up                | `consult-closeout-generate.ts`, `consult-wrap-up.ts`, `ConsultCloseoutEditor` | Split into an internal report and client action memo. Do not reuse one JSON object for both audiences.                    |
| Living File updates             | existing Living File projection/write conventions                             | Continue using the existing semantic write path; only attorney-approved consult decisions become accepted case state.     |
| Fee estimate                    | existing consult fee estimate module and panel                                | Attach it to the engagement decision and require communication status before representation begins.                       |

### Gaps to close

The current system transcribes only after recording stops, stores a flat transcript, generates one client closeout object from notes/transcript, and has no first-class conflict gate. It therefore cannot yet:

- prevent substantive intake from preceding clearance;
- show exactly who was searched, which possible matches were reviewed, or who made the decision;
- prepare from a conflict-safe minimum-contact record;
- distinguish transcript assertions from verified facts;
- maintain a live objective, timeline, issue map, deadline table, evidence list, contradiction list, and open-question queue;
- distinguish attorney-only decision logic from client-safe advice;
- prevent a draft client memo from implying an engagement, completed research, guaranteed result, or assumed deadline;
- create tasks and calendar items from an attorney-approved decision atomically.

## 3. Non-negotiable product boundaries

### 3.1 Conflict boundary

Before clearance, the client-facing system may collect only:

- prospective client's legal name and aliases;
- adverse people and organizations, affiliates, insurers, employers, known witnesses, and known lawyers;
- matter type, venue, case number, and known deadline/event dates;
- requested service level;
- existing representation status; and
- the minimum neutral description needed to distinguish the matter.

The UI says **“Do not send documents or describe confidential strategy yet.”** Narrative prompts, file upload, substantive chat, consultation capture, and advice generation remain locked. If a client volunteers merits information despite the warning, it is stored as restricted prospective-client information and is not summarized into firm-wide search results.

### 3.2 Human decision boundary

The conflict engine produces **candidates, explanations, and missing-party recommendations**, not a legal conclusion. Only an authorized reviewer can record:

- `cleared`;
- `hold_for_information`;
- `ethics_review`;
- `waiver_required`; or
- `declined`.

Every decision records reviewer, timestamp, search snapshot, rationale, and—when applicable—the approval/waiver prerequisite. A later addition of a party automatically makes the prior result **stale** and blocks new substantive work until a delta review is completed.

### 3.3 Advice and engagement boundary

The live associate may organize and suggest questions, but it does not silently send advice or establish scope. The attorney must select the consultation outcome:

- decline/non-engagement;
- consultation only;
- further investigation before decision;
- limited-scope engagement;
- full representation; or
- referral.

Client-facing advice is gated by that outcome and the approved scope. Engagement or limited-scope selection also requires an explicit fee/rate-basis communication state.

### 3.4 Two-artifact boundary

The following are separate persisted artifacts with separate prompts, schemas, permissions, revision histories, validations, and actions:

**Internal consult report (attorney work product)**

- client/matter/scope identity;
- objectives and decision requested;
- confirmed, disputed, unknown, and inferred facts with sources;
- material timeline;
- issues, exposure, defenses, credibility concerns, adverse evidence, and assumptions;
- deadlines with source and confidence;
- options, recommendation, confidence, and decision logic;
- engagement disposition and internal tasks;
- unresolved research and conflict/ethics flags.

**Client action memo (client-deliverable draft)**

- what the client asked the firm to address;
- current assessment in plain English;
- material facts relied on, with uncertainty plainly labeled;
- realistic options and recommended path;
- client and firm next actions with owners and dates;
- known deadlines and what remains to be verified;
- included and excluded scope;
- engagement/non-engagement status and appropriate disclaimers;
- fee/rate-basis reference when applicable; and
- next contact.

No “copy internal to client memo” operation exists. Both are generated from the same attorney-approved structured record, but through different projections. A client memo is never deliverable merely because the internal report is approved.

## 4. Target experience

### 4.1 Scheduling creates a gated consult workspace

When a consult is scheduled or requested:

1. Resolve the existing `case_file_id` through the canonical matter-routing boundary.
2. Create or update the consult aggregate.
3. Open the conflict pre-screen if no current clearance covers the exact participant set.
4. Give the client a short participant form and the do-not-submit notice.
5. Put the consult in the attorney's **Conflict review** queue—not the substantive consult queue.
6. Create preparation work only after clearance.

Scheduling is not clearance, and payment is not clearance. The confirmation language must not imply either representation or conflict approval.

### 4.2 Optimized conflict review

The attorney/staff experience is a keyboard-friendly triage queue designed to clear clean matters quickly without automating the judgment.

**Queue row**

- consult time and urgency;
- proposed client and matter;
- count of participants searched;
- highest match strength;
- missing-participant suggestions;
- change since the last review;
- status and assigned reviewer.

**Review drawer**

- left: normalized party roster grouped as prospective client, adverse, affiliate, insurer, employer, witness, and lawyer;
- center: possible matches grouped by exact identity, alias/contact match, organization/affiliate match, and fuzzy name match;
- right: prior client/matter relationship, role, dates, responsible attorney, relatedness indicators, and a link to the permitted internal record;
- footer: decision, short rationale templates, optional note, and next action.

**Fast-clear behavior**

- Clean searches with a complete roster open preselected on `cleared`, but still require the reviewer to press **Confirm clearance**.
- Keyboard shortcuts advance through matches and then to the next consult.
- Bulk operations are limited to assigning reviewers or marking “needs information”; there is no bulk conflict clearance.
- The reviewer can accept suggested aliases/affiliates and rerun only the delta.
- Exact or strong matches cannot be dismissed without a reason.
- `waiver_required` creates a blocking task and cannot become clear until the approved waiver record is linked.

The search should initially use deterministic normalization and indexed candidate retrieval: case-folding, punctuation/legal-suffix removal, alias/contact matching, tokenized organization names, and conservative similarity ranking. An LLM may suggest relationships or missing entities from the minimum neutral description, but its suggestion is labeled and never becomes a searched party without reviewer confirmation.

### 4.3 Preparation packet

Clearance triggers one durable preparation job. Its output is a versioned snapshot, not a mutable prose field:

1. **Consult frame:** client identity, requested service, known attendee/confidentiality question, scope posture, and engagement status.
2. **Client objective:** desired outcome, must-happen-by date, worst outcome, and 30-day priority—blank where unknown.
3. **Known chronology:** date/event/source/confidence, without turning client assertions into accepted facts.
4. **Issue hypotheses:** questions to explore, expressly not legal conclusions.
5. **Evidence inventory:** available, referenced but missing, and likely material.
6. **Deadline table:** date, event, source, consequence, confidence, verification owner.
7. **Adverse-case prompts:** likely opposing account, harmful fact/document/witness, defenses, mitigation, and credibility topics.
8. **Meeting plan:** opening frame, highest-value questions in order, and a final readback checklist.
9. **Preparation provenance:** source revision/watermarks and generation time so the attorney knows what changed afterward.

Auto-generation happens once when clearance becomes effective. A **Refresh from new information** action shows the delta before replacing the current snapshot. The packet is clearly labeled attorney work product.

### 4.4 The consult cockpit

`ConsultSessionView` becomes a focused three-column desktop cockpit, responsive to a two-tab tablet layout:

**Left — meeting control**

- client/matter/scope identity;
- clearance badge and roster-change indicator;
- session clock;
- explicit consent state, capture source, and audio health;
- start/pause/resume/end controls;
- private quick note;
- bookmark moment; and
- fallback instructions if tab audio is absent.

**Center — structured record**

- current objective;
- date-anchored timeline;
- confirmed/disputed/unknown/inference buckets;
- evidence and missing documents;
- issue map;
- deadline table; and
- opposing account/adverse evidence.

Every card shows provenance: speaker, transcript range or note, timestamp, and model confidence. AI additions are visually provisional. The attorney can accept, correct, move, merge, reject, or pin an item. Accepting an item approves it for the consult record, not automatically as a globally established fact in the Living File.

**Right — quiet associate**

- at most three current prompts;
- “why this matters” on expansion;
- resolved/snoozed/ask controls;
- contradiction and deadline warnings;
- coverage meter for objectives, timeline, evidence, adverse case, scope, and closeout; and
- a collapsed running draft status, not full memo prose.

The transcript is available in a drawer rather than occupying the main workspace. The attorney is conducting a consultation, not editing captions.

### 4.5 Quiet-associate interruption policy

The associate continuously analyzes finalized transcript segments but only surfaces a prompt when one of these conditions is met:

| Priority | Trigger                                                                                                              | Example                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Critical | Imminent or contradictory deadline, new unsearched party, consent/capture failure, representation ambiguity          | “A hearing next Tuesday was mentioned; source and exact date are unverified.”  |
| High     | Missing decision objective, material timeline gap, admission/adverse evidence, direct contradiction, scope ambiguity | “Ask what document most hurts the client's position.”                          |
| Normal   | Useful follow-up, missing evidence source, open factual detail                                                       | Held in the queue until the attorney opens it or higher priorities are absent. |

Rules:

- No more than three visible prompts and no more than one new noncritical prompt every 90 seconds.
- Do not propose an answer when a clarifying question is safer.
- Do not state law as researched unless a verified authority workflow actually ran.
- Do not infer credibility, mental state, protected traits, or truthfulness from voice.
- Do not perform sentiment scoring.
- Repeat alerts only if new evidence increases priority.
- Suppression is recorded so post-call coverage can show what the attorney chose not to pursue.

### 4.6 Close with a readback

The **Prepare readback** button becomes available throughout the meeting. It produces concise editable bullets:

- who the client is and who else participated;
- objective and immediate risk;
- current material facts and important uncertainties;
- what the firm is and is not undertaking;
- what the client will provide/do;
- what the firm will do, conditional on engagement status; and
- the next deadline/contact.

The attorney reads it aloud, records corrections, and checks **Readback completed**. This is a consult event, not proof that the client agreed to every legal conclusion.

### 4.7 Post-call decision gate and quick memo path

Ending capture finalizes remaining segments and opens a compact **Decision & documents** panel:

1. Confirm/correct attendees, scope, material facts, deadlines, and unresolved questions.
2. Select disposition and effective advice level.
3. Record fee/rate-basis communication status when engagement is selected.
4. Assign the next contact and date.
5. Press **Build both drafts**.

The generation job creates both artifacts in parallel from one frozen, attorney-approved consult snapshot. The UI immediately opens a split review:

- **Internal report:** editable and attorney-only; approve to finalize the consult decision record.
- **Client memo:** editable, plain-English, and blocked from delivery until validation and explicit approval.

For speed, the attorney can choose **Internal only** or **Client memo only**, but the default action builds both. Generation never sends. Delivery is a separate explicit action, preserving the existing approval/delivery boundary used elsewhere in the product.

## 5. Capture and near-live processing architecture

### 5.1 Browser capture

Continue using microphone plus optional shared-tab audio. Improve the current recorder as follows:

- make consent persistence a hard prerequisite—do not continue recording when that write fails;
- show separate mic and tab-audio meters before capture starts;
- emit 15–30 second `MediaRecorder` chunks rather than one call-length blob;
- upload each chunk with a monotonically increasing sequence number, capture timestamps, content hash, MIME type, and retry key;
- retain a local encrypted-or-ephemeral retry queue until the server acknowledges a chunk;
- pause visibly when browser/device capture stops;
- support crash/reload recovery without overwriting acknowledged chunks; and
- assemble a retained source recording only if firm retention policy calls for one.

The product must explicitly disclose that browser/OS combinations may capture only the attorney microphone. Audio health must never be implied from an active red dot alone.

### 5.2 Transcript pipeline

Do not repeatedly replace `consult_recordings.transcript_text`. Use append-only segment versions:

1. Browser uploads an audio chunk.
2. A durable server job transcribes the chunk.
3. The server writes speaker-neutral provisional segments with start/end offsets.
4. Adjacent context performs light reconciliation and creates a new segment version where needed.
5. Finalized segments enter the associate-analysis queue.
6. The UI receives status through a scoped realtime subscription or short polling fallback.

Target service levels—not guarantees:

- upload acknowledgment: under 3 seconds at p95 on a healthy connection;
- provisional text: 10–25 seconds behind speech at p95;
- structured associate update: within 10 seconds of a finalized segment;
- zero acknowledged chunks lost;
- duplicate upload is idempotent.

Speaker attribution is useful but not a release blocker. In the first release, allow the attorney to label a segment or bookmarked passage as client/attorney/other. Never fabricate speaker identity.

### 5.3 Durable associate analysis

The analyzer consumes only new finalized segments plus the current compact consult state. It does not resend the full transcript on every chunk.

Each run returns typed operations rather than prose:

- add/update objective;
- propose timeline event;
- propose fact with bucket and source;
- propose evidence item;
- propose deadline and confidence;
- propose issue/question;
- link contradiction;
- raise/snooze prompt;
- update coverage; and
- append draft-ready source material.

Operations carry `analysis_run_id`, source segment IDs, prompt/schema version, confidence, and dedupe key. Applying a run is transactional and idempotent. A failed run can replay without duplicating facts or prompts.

## 6. Data model plan

Use a new stage migration only when implementation begins, following the repository's imperative stage-migration convention. Do not add a second consult identity table.

### 6.1 Extend the consult aggregate

Add focused fields to `consult_requests` only for high-level state:

- `workflow_stage`: pre-screen, conflict-review, preparation, ready, live, decision, drafting, closed;
- `conflict_clearance_id`;
- `preparation_snapshot_id`;
- `consult_record_snapshot_id`;
- `engagement_decision_id`;
- `readback_completed_at` and actor;
- `capture_policy`/retention selection; and
- closeout timestamps that cannot be inferred safely from `status`.

Keep scheduling `status` during the migration window to avoid breaking current screens. Define one canonical transition function in application code, then retire ambiguous status usage only after all readers move.

### 6.2 Conflict entities

| Table                 | Purpose and important fields                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `conflict_parties`    | Matter-scoped participant roster: display name, normalized name, aliases, role, entity type, contact fingerprints where lawful, source, active version. Never store merits narrative here. |
| `conflict_searches`   | Immutable search snapshot: consult, participant-set hash, algorithm version, requested/completed time, status.                                                                             |
| `conflict_candidates` | Search-to-existing-record candidates: searched party, candidate profile/matter/party, match signals and score, disposition and reviewer note. Restrict sensitive underlying information.   |
| `conflict_clearances` | Human decision: participant-set hash, decision, reviewer, rationale, effective/stale timestamps, waiver prerequisite/reference. Append decisions; do not overwrite history.                |

Indexes should support normalized-name candidate lookup, contact fingerprint equality, consult roster reads, candidate review by search, and active clearance by consult/participant hash. Fuzzy similarity should retrieve a bounded candidate set; it should not scan all names per keystroke.

### 6.3 Live capture entities

| Table                                 | Purpose and important fields                                                                                                                 |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `consult_audio_chunks`                | Server-authored immutable chunk metadata: consult/recording, sequence, start/end, hash, storage location, processing state, idempotency key. |
| `consult_transcript_segments`         | Segment identity and current finalized version pointer: offsets, provisional/final state, optional speaker label.                            |
| `consult_transcript_segment_versions` | Append-only text corrections with source chunk(s), engine/version, created time, correction actor.                                           |
| `consult_analysis_runs`               | Durable analyzer cursor, input segment range, prompt/schema version, status, token/cost telemetry, error.                                    |

Keep raw audio and transcript access attorney-only. Browser writes go through authenticated server routes that verify the consult and actor; storage paths are not trusted from the client. Service-role writes remain server-only.

### 6.4 Structured consult record

Use typed rows for items that require provenance, correction, and linking—not one growing JSON blob:

| Table                  | Kinds/fields                                                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consult_record_items` | objective, fact, timeline event, evidence, deadline, issue, option, assumption, scope limit, adverse account; text, state, confidence, source kind/id/range, proposed/accepted/rejected, accepted actor/time. |
| `consult_record_links` | contradiction, supports, disputes, depends-on, duplicates, addresses.                                                                                                                                         |
| `consult_prompts`      | priority, reason, suggested question, source items, shown/snoozed/resolved/asked state.                                                                                                                       |
| `consult_snapshots`    | Immutable point-in-time manifest of accepted item/version IDs used for preparation, readback, decision, and artifact generation.                                                                              |

Do not write proposed live facts directly into `fact_items`. At closeout, show an approval diff; accepted durable facts then flow through the canonical Living File synchronization boundary.

### 6.5 Decisions, artifacts, and delivery

| Table                          | Purpose                                                                                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `consult_engagement_decisions` | Disposition, advice level, included/excluded scope, decision rationale, fee communication status/date/method, approver, further-investigation condition. |
| `consult_artifacts`            | `internal_report` or `client_action_memo`, source snapshot, prompt/schema version, lifecycle state, current revision.                                    |
| `consult_artifact_revisions`   | Append-only structured content, editor, creation source, revision number.                                                                                |
| `consult_artifact_approvals`   | Artifact-specific approval with revision ID and approver. Approval of one artifact never approves the other.                                             |

Use the existing delivery infrastructure where it can accept a consult artifact as a typed source. Do not create a second email sender. A delivery references the exact approved client-memo revision so later edits cannot alter what was sent.

### 6.6 RLS and access posture

- Conflict rosters, searches, candidates, clearance rationales, recordings, transcript segments, structured consult records, prompts, internal reports, and internal decisions are attorney/staff-only.
- Prospective clients can read/update only their permitted minimum-contact form and later read an explicitly delivered client memo.
- Client ownership of a consult or case must not expose internal work product.
- Every public-schema table has RLS enabled; policies include both row ownership/firm authorization and appropriate `WITH CHECK` clauses.
- Privileged inserts and immutable event rows use server routes/service credentials, never a browser service key.
- Storage access follows the same consult authorization and retention rules as database metadata.
- Firm roles should ultimately distinguish conflict reviewer, consulting attorney, supervising attorney, and staff; until then, keep the current attorney-only posture and do not simulate roles in client-editable metadata.

## 7. API and module ownership

Consolidate around explicit owners:

| Capability                     | Proposed canonical module                                  | Representative routes                                                       |
| ------------------------------ | ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| Workflow transitions/gates     | `lib/consult-workflow.ts`                                  | `/api/attorney/consult/[id]/transition`                                     |
| Conflict normalization/search  | `lib/conflict-screening.ts`                                | `/api/attorney/conflicts/searches`, `/api/attorney/conflicts/[id]/decision` |
| Preparation snapshot           | evolve `lib/pre-consult-generate.ts`                       | existing case-file consult-brief route, made consult-specific               |
| Capture ingestion              | evolve `lib/consult-recording.ts`                          | existing recordings route plus `/chunks` and recovery status                |
| Transcript reconciliation      | `lib/consult-transcript.ts`                                | worker-owned; corrections route remains explicit                            |
| Live analysis                  | `lib/consult-associate.ts`                                 | durable worker/status endpoint; no direct client model call                 |
| Structured record              | `lib/consult-record.ts`                                    | `/record/items`, `/prompts`, `/snapshot`                                    |
| Engagement decision            | `lib/consult-decision.ts`                                  | `/decision`                                                                 |
| Artifact generation/validation | replace closeout generator with `lib/consult-artifacts.ts` | `/artifacts/generate`, `/artifacts/[id]/revisions`, `/approve`              |
| Task/Living File projection    | existing guidance/Living File owners via a consult adapter | `/closeout/apply`                                                           |

`lib/consult-workflow.ts` is the only code allowed to decide whether substantive actions are unlocked. Routes ask it for a capability decision such as `mayPrepare`, `mayCapture`, `mayGenerateClientAdvice`, or `mayDeliver`; they do not duplicate status checks.

Add a guard test that fails if a new route independently derives these permissions from raw status columns. This repository's consolidation rule applies here as strongly as it does to document persistence.

## 8. AI contracts and safety

### 8.1 One source packet, purpose-specific projections

The frozen consult snapshot plus engagement decision forms a `ConsultSourcePacket`. It contains accepted structured items and explicit unknowns, not an undifferentiated transcript. Three separate model contracts consume it:

1. **Live organizer:** typed proposed record operations and prompts; never client-deliverable prose.
2. **Internal report writer:** candid analysis and decision logic; attorney-only.
3. **Client memo writer:** plain English, approved scope/advice level, safe next actions and limits.

This prevents prompt drift from turning internal risk analysis into client-facing content.

### 8.2 Required validations

**Both artifacts**

- every concrete factual assertion links to an accepted source item or is labeled unknown/assumption;
- dates must link to a deadline/timeline item and preserve its confidence;
- no invented authority, jurisdiction, party, promise, action, or completion;
- unresolved conflicts and stale participant rosters block generation;
- the generated schema and source snapshot are recorded.

**Internal report**

- includes adverse facts and unresolved unknowns, not only the favorable narrative;
- separates legal judgments requiring research;
- states decision rationale and confidence;
- is visibly marked attorney work product/not for client delivery.

**Client memo**

- scope and exclusions agree with the engagement decision;
- language does not imply representation when disposition is consult-only, decline, investigation, or referral;
- no outcome guarantees or false claims that research was performed;
- all actions have owner and date or are explicitly unscheduled;
- known deadlines include source/confidence and appropriate warning;
- “we will” tasks are blocked unless the firm actually accepted them;
- fee/rate-basis state is present when required;
- sensitive internal fields cannot serialize into the client schema.

A deterministic validator runs before model-based QA. Any blocking failure disables approval/delivery and links the attorney to the exact field.

### 8.3 Versioning and observability

For each generation/analysis run record:

- model/provider;
- prompt and output schema version;
- input snapshot or segment cursor;
- output revision/operation IDs;
- latency, tokens, and cost;
- truncation/stop reason;
- validation results; and
- human acceptance/rejection rates.

Raw privileged content must not be copied into general application logs or analytics.

## 9. Tasks, calendar, and Living File application

Artifact approval and matter updates are different actions. After the engagement decision and internal record are approved, show an **Apply approved plan** diff:

- accepted facts → canonical fact/Living File flow;
- document requests → `requested_attachments`;
- attorney/client actions → existing matter-task/guidance chain adapter;
- deadlines → calendar/task record with source and verification state;
- next action → canonical guidance computation, not a competing consult-only recommendation;
- referral/closure → case status only after confirmation; and
- client memo → delivery composer, never automatic send.

Application must be idempotent. Each created task/fact/deadline retains its consult source item and artifact revision. Re-running closeout cannot create duplicates.

## 10. Implementation sequence

Each vertical slice ships behind firm-level feature flags, with migrations, tests, instrumentation, and rollback behavior in the same pull request. The live-session route continues to work throughout.

### Slice 0 — contracts and guardrails (2–3 engineering days)

- Define workflow stages, capabilities, transition matrix, artifact schemas, advice levels, and typed source packet.
- Add pure unit tests for every permitted/forbidden transition.
- Add the “one workflow gate owner” architectural guard.
- Inventory every current consult status reader/writer and map its migration.
- Get firm counsel approval for conflict notices, consent copy, engagement-status language, retention defaults, and Texas-specific memo warnings.

**Exit:** No schema/UI change; all later slices have stable contracts and explicit legal-copy owners.

### Slice 1 — conflict-safe scheduling and fast review (1–2 weeks)

- Add conflict roster/search/candidate/clearance schema and RLS.
- Replace unrestricted pre-consult prompts/uploads with the minimum-contact form when no clearance exists.
- Build deterministic search, missing-party recommendations, delta reruns, and review queue/drawer.
- Gate substantive intake, preparation, capture, and advice through `consult-workflow`.
- Make participant changes stale the clearance.
- Add audit history and waiver/ethics tasks.

**Exit:** A scheduled consult cannot reach substantive preparation or the session cockpit without a current human clearance covering its participant-set hash. A clean screen can be reviewed and confirmed in under 30 seconds without bulk clearance.

### Slice 2 — preparation packet and cockpit shell (1 week)

- Convert pre-consult memo to a versioned, consult-scoped snapshot with provenance.
- Build the three-column cockpit and preparation/readback sections.
- Preserve the existing notepad, Living File view, and recorder as temporary adapters.
- Add coverage state and manual structured-record editing before live AI is enabled.

**Exit:** The attorney can prepare and run a structured consultation manually within one screen; no capability is lost if live AI is disabled.

### Slice 3 — resilient chunked transcription (1–2 weeks)

- Add chunk/segment/version/job schema, storage policies, and cleanup/retention jobs.
- Change browser capture to acknowledged resumable chunks with audio-health UI.
- Implement durable transcription, reconciliation, correction history, realtime/poll fallback, and crash recovery.
- Make consent logging fail closed.

**Exit:** In supported browsers, text trails speech by no more than the target band under healthy conditions; acknowledged chunks survive reload and retry; mic-only capture is unmistakable.

### Slice 4 — quiet live associate (2 weeks)

- Add structured record items/links/prompts and durable analysis cursors.
- Implement incremental typed operations, deduplication, source linking, coverage, contradiction detection, and interruption budget.
- Add attorney accept/correct/reject/pin controls and transcript source navigation.
- Add new-party detection that pauses analysis and requests a conflict delta review rather than continuing silently.
- Measure prompt usefulness and attorney interaction without storing content in analytics.

**Exit:** The associate updates the record incrementally, never emits unsupported accepted facts, shows no more than three prompts, and remains fully optional. The attorney can complete the consult if the model is unavailable.

### Slice 5 — decision gate and two quick drafts (1–2 weeks)

- Add engagement-decision, snapshot, artifact, revision, and approval schema.
- Replace the single wrap-up generator/editor with the internal report and client memo split review.
- Add deterministic source/scope/deadline/commitment/fee validators.
- Default to **Build both drafts** with one-click single-artifact alternatives.
- Adapt current wrap-up data into a read-only legacy view; do not reinterpret old client closeouts as internal reports.

**Exit:** Both drafts are available quickly after the attorney confirms the decision; they have different schemas and approvals; no generation action can deliver content.

### Slice 6 — approved closeout and delivery (1 week)

- Add the idempotent approval diff into Living File, requested documents, tasks, calendar, next-step guidance, and matter status.
- Reuse the canonical delivery composer and immutable sent-revision model.
- Add declination/referral/limited/full engagement workflow launchers and fee communication tasks.
- Add follow-up reminders and overdue closeout dashboard states.

**Exit:** Another attorney can reconstruct the decision six months later; the client sees only the exact approved client memo; every promised next step has an owner and date.

### Slice 7 — hardening and controlled rollout (1 week plus observation)

- Browser/OS test matrix; network loss, reload, long-call, permission loss, tab-audio absence, duplicate chunk, and model outage drills.
- Security/RLS/advisor review and retention/deletion verification.
- Shadow mode on internal test consults, then a small firm cohort, then opt-in general release.
- Tune interruption thresholds and conflict ranking from reviewer feedback without changing human-clearance semantics.
- Publish support runbooks for failed capture, erroneous transcript, participant change, stale conflict screen, and mistaken delivery.

## 11. Test strategy

### Unit and property tests

- workflow transition/capability matrix;
- participant normalization and stable roster hash;
- candidate ranking boundaries and no auto-clear return type;
- chunk sequence/idempotency/reconciliation;
- analysis operation dedupe and cursor advancement;
- prompt priority/rate budget;
- snapshot immutability;
- artifact schema separation and forbidden-field serialization;
- deadline/source/scope/commitment validators; and
- idempotent approved-plan projection.

### Integration tests

- RLS: client cannot read conflict candidates, transcript, prompts, internal report, or undelivered client draft;
- scheduling does not unlock narrative/uploads before clearance;
- roster change stales clearance and pauses substantive processing;
- service-only chunk/event creation cannot be forged through a user JWT;
- duplicate/reordered chunks produce one ordered transcript;
- analysis retry produces no duplicate items;
- artifact generation uses the exact frozen snapshot;
- approval of internal report does not approve or deliver client memo;
- client memo delivery references an approved immutable revision; and
- closeout replay creates no duplicate tasks or facts.

### End-to-end scenarios

1. Clean matter → 30-second human clear → preparation → captured consult → quiet prompts → both drafts → approve → deliver.
2. Strong former-client match → ethics hold → no substantive intake or session.
3. New adverse party named live → capture may continue as an attorney-controlled safety choice, but analysis/advice and closeout pause pending delta review; the event is prominent.
4. Client declines recording → manual notepad and structured cockpit still complete the workflow.
5. Tab audio missing → warning, mic-only transcript, attorney notes fill gaps, memo labels source limitations.
6. Offline/reload mid-call → acknowledged chunks retained, local pending chunks retry, no duplicate transcript.
7. Unknown deadline → critical prompt, client memo labels verification need, calendar item cannot masquerade as confirmed.
8. Consult-only disposition → memo cannot say the firm “will file” or imply ongoing representation.
9. Model outage → attorney completes structured record and uses deterministic templates; no lost consult.

### Required repository checks for every implementation slice

From `artifacts/instant-attorney`:

```bash
pnpm typecheck
pnpm test
pnpm lint
pnpm schema:strict
NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder pnpm build
```

Schema slices also require applying the migration to a disposable/staging database, exercising representative RLS queries with client and attorney JWTs, and running Supabase security/performance advisors.

## 12. Success measures

### Safety and quality

- 100% of substantive consults have a current human conflict clearance covering the participant hash.
- 100% of delivered memos reference an approved immutable client-memo revision.
- 0 internal-report fields appear in client artifact serialization tests.
- 100% of deadline statements have a source and confidence state.
- 0 automatic engagement, conflict-clearance, or delivery actions.
- Accepted live items retain source provenance.

### Attorney effectiveness

- median clean conflict review under 30 seconds;
- preparation packet available within 2 minutes of clearance on ordinary matters;
- provisional transcript p95 within 25 seconds on supported healthy connections;
- fewer than four visible live prompts at all times;
- at least 60% of surfaced high-priority prompts marked asked/helpful during pilot;
- both initial drafts ready within 90 seconds of a frozen closeout snapshot on ordinary matters;
- median attorney time from session end to approved next-action plan under 10 minutes; and
- 90% of completed consults have a dated owner for the next action before closeout.

### Reliability

- 99.9% of acknowledged audio chunks durably accounted for;
- idempotent retry in every ingestion, analysis, generation, and projection job;
- no full-call loss from reload after acknowledged chunks;
- model/transcription outage never prevents manual completion.

## 13. Deferred deliberately

- Zoom/Meet joining bots and calendar-platform recording automation;
- autonomous conflict clearance;
- autonomous legal research or live legal conclusions;
- voice-based emotion, credibility, or deception analysis;
- client-visible live transcript;
- automatic speaker identity;
- automatic memo delivery;
- a generalized firm-wide event-sourcing rewrite; and
- replacing the existing Living File/guidance chain with a consult-specific case spine.

These may be evaluated after the browser companion proves reliable. None is required to make the initial consult experience elite.

## 14. Release checklist requiring owner decisions

The following are implementation inputs, not reasons to delay Slices 0–2. Product/legal operations must approve them before real capture or client delivery:

- firm recording-consent script and whether assent itself must be captured in audio;
- state-by-state recording restrictions and behavior outside Texas;
- audio, transcript, conflict-record, and artifact retention/deletion periods;
- authorized conflict reviewer roles and escalation owner;
- external conflict-data imports, if any, and their source-of-truth precedence;
- fee/rate-basis templates and signature/acknowledgment requirements;
- approved engagement, limited-scope, referral, and non-engagement templates;
- whether live discovery of a new party requires pausing audio or only pausing analysis/advice; and
- pilot browsers/devices and acceptable transcription vendor/data-processing terms.

Until these are approved, the safest defaults are: explicit consent before capture, attorney-only access, no automatic deletion promise, no automatic conflict result, pause substantive AI processing on a stale roster, no implied engagement, and no client delivery without approval.
