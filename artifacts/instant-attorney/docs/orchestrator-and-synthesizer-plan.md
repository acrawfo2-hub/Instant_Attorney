# Orchestrator tool-use + matter synthesizer — plan of record

Status: **proposed** · Owner: Andrew Crawford · Last updated: 2026-07-26

This is the build plan for the next phase of the freestyle/orchestrator direction:
turning the assistant from something that *talks about* next steps into something
that *knows the whole file, tells the user what is doable now vs. blocked, and can
actually run the tool to do it*. It follows the Living File restructure (Stage 41),
which demoted the consumer file to a reference view and routed "what's next" to the
orchestrator chat.

---

## 1. Decisions locked

- **Evolve `chat-acp` in place.** The agentic loop is added to the existing
  `/api/chat-acp` route, gated to freestyle/orchestrator mode. Intake stays on the
  single-turn path. No new route.
- **Consumer-first.** The orchestrator is the consumer "what's next" surface. The
  attorney freestyle workspace can adopt the same tools later.
- **Build order:** (1) synthesizer, (2) read-only calculator tool-loop,
  (3) `assess_matter` as a tool, (4) generative/side-effecting tools.
- **Deterministic core stays deterministic.** Calculators are pure, tested lib
  functions. The model decides *when* to call and *with what params*; the server
  runs the real function. The model never re-derives a calculation in prose.

---

## 2. Foundation that already exists (do not rebuild)

- **Every calculator is a pure, unit-tested lib function** with a typed `Input`, a
  `…ToFact(result)` helper (result → Living File fact), and a `format…(result)`
  helper (human-readable string):
  `bankruptcy-means-test`, `family-support-calc`, `family-maintenance-calc`,
  `family-property-calc`, `family-possession-calc`, `bankruptcy-exemptions`,
  `pi-sol-calc`, `pi-fault-calc`, `defamation-assessment`, `noncompete-assessment`,
  `estate-probate-estimate`.
- **`computeMissionControl(input)`** (`lib/mission-control.ts`) already returns a
  ranked board of actions with `status: open|blocked|done`, `priority`, `reason`,
  and missing-fact ids — the deterministic skeleton the synthesizer needs.
- **`pi-sol-calc` already emits `urgency: expired|critical|warning|ok`** and
  `daysRemaining` — deadline signal for synthesizer ranking.
- **Freestyle workspace + drafts panel** (Stage 39/40): chat + inline attachments +
  an editable/downloadable `---DRAFT---` side panel, with the `parseDrafts` /
  `stripDraftsForDisplay` protocol in `lib/freestyle-drafts.ts`. Generative tools
  reuse this — a draft tool emits a `---DRAFT---` block and it lands in the panel.
- **Living File extractor + `parseAndUpdateFile`** already fold structured blocks
  into `fact_items` / `case_files`. Tool fact-writes reuse this path.

---

## 3. Architecture A — agentic tool-use loop in `chat-acp`

### 3.1 Gating

The loop runs only when the request is in orchestrator mode. Reuse the existing
`mode` field: `mode === "freestyle"` opts into tools. (Optional: a distinct
`orchestrator` flag if we want freestyle-without-tools to remain available.)
Intake (`mode !== "freestyle"`) keeps the current single-`stream()` path untouched.

### 3.2 The loop

Replace the single `anthropic.messages.stream(...)` (freestyle branch only) with:

```
messages = [...history]
for iteration in 0..MAX_TOOL_ITERATIONS:        # cap, e.g. 5
    stream = anthropic.messages.stream({ model, system, tools, messages })
    forward text deltas to the client as today
    final = await stream.finalMessage()
    if final.stop_reason !== "tool_use":
        break                                   # normal end_turn
    toolResults = []
    for block in final.content where block.type == "tool_use":
        emit a tool-status marker to the client (see 3.3)
        result = await dispatchTool(block.name, block.input, ctx)   # server-side, deterministic
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result.forModel })
    messages.push({ role: "assistant", content: final.content })
    messages.push({ role: "user", content: toolResults })
# after loop: persist the assistant transcript, run draft/living-file extraction as today
```

`dispatchTool` is a server-side switch over the registry (§4). Deterministic tools
return synchronously; generative tools may themselves call the model.

### 3.3 Streaming protocol to the UI

Text deltas stream as today. Tool activity is surfaced with sentinel markers in the
same text stream (consistent with the existing `\x00caseFileId\x00` and
`\x01TRUNCATED\x01` conventions), e.g.:

- `\x02TOOL:run_means_test:running\x02` when a tool starts
- `\x02TOOL:run_means_test:done\x02` when it returns

The client renders these as inline "Running the Chapter 7 means test…" chips that
resolve to a result card. Draft-producing tools continue to use the existing
`---DRAFT---` panel path — no new channel needed.

### 3.4 Error / missing-params handling

- Tools validate their input server-side. On missing/invalid params they return a
  structured `{ error: "need", missing: ["householdSize"] }` as the `tool_result`;
  the model relays a natural question to the user rather than guessing.
- Tool exceptions return `{ error: "failed", message }` — the model apologizes and
  continues; the turn never hard-fails on a tool error.
- `MAX_TOOL_ITERATIONS` guards against loops; on exhaustion the model gets a final
  "tool budget reached" result and must respond in text.

### 3.5 Persistence

- The user-visible assistant text is persisted to `intake_messages` as today.
- Tool calls + results are persisted to a new `orchestrator_tool_calls` table
  (`case_file_id, user_id, tool_name, input jsonb, result jsonb, created_at`) for
  auditability and cost attribution. Not shown to the client except as the inline
  chips.
- `recordAiFromMessage` runs per model turn (each loop iteration) so cost tracking
  stays accurate across the multi-turn loop.

---

## 4. Tool registry

New file `lib/orchestrator-tools.ts`: an array of Anthropic tool definitions plus a
`dispatchTool(name, input, ctx)` map to the pure lib functions. `ctx` carries
`{ db, userId, caseFileId, caseFile, facts }`.

### 4.1 Conventions

- **Naming:** verb_object (`run_means_test`, `estimate_child_support`).
- **Params:** exactly the calculator's `Input` type, expressed as JSON schema.
- **Fact-write policy (open decision §7):** default *propose, don't auto-write* —
  the tool returns the `…ToFact` value in its result and the model offers to save
  it; a later `update_living_file` (or a confirm affordance) commits it. Avoids the
  file silently accreting speculative estimates.
- **Every estimate result carries its `disclaimer`** back to the model, which must
  surface the "estimate, not advice until attorney review" framing.

### 4.2 Phase 1 — read-only, deterministic

| Tool | lib fn | Input | Notes |
|---|---|---|---|
| `run_means_test` | `runMeansTest` | `MeansTestInput` | Ch.7 income screen |
| `estimate_child_support` | `estimateChildSupport` | `ChildSupportInput` | TX guideline |
| `screen_pi_sol` | `screenPiSol` | `PiSolInput` | **deadline → urgency** |
| `estimate_maintenance` | family-maintenance-calc | its `Input` | spousal maintenance |
| `estimate_property_split` | family-property-calc | its `Input` | community estate |
| `possession_schedule` | family-possession-calc | its `Input` | SPO calendar |
| `estimate_bankruptcy_exemptions` | bankruptcy-exemptions | its `Input` | exempt/non-exempt |
| `assess_defamation` | `assessDefamation` | `DefamationInput` | elements screen |
| `assess_noncompete` | `assessNoncompete` | `NoncompeteInput` | enforceability |
| `estimate_pi_fault` | pi-fault-calc | its `Input` | comparative fault |
| `estimate_probate` | estate-probate-estimate | its `Input` | probate cost/route |

Representative concrete schemas (mirror the `Input` interfaces verbatim):

```jsonc
// run_means_test  → MeansTestInput
{
  "name": "run_means_test",
  "description": "Run the Chapter 7 means-test income (median) screen for a Texas household. Use when the user is weighing bankruptcy and their household size and income are known or can be asked for.",
  "input_schema": {
    "type": "object",
    "properties": {
      "householdSize": { "type": "integer", "minimum": 1, "description": "People in the household." },
      "annualIncome": { "type": "number", "description": "Annualized current monthly income. Provide this OR averageMonthlyIncome." },
      "averageMonthlyIncome": { "type": "number", "description": "Average monthly income over the prior 6 months (CMI)." },
      "medianOverride": { "type": "number", "description": "Override the state median with the current UST figure." }
    },
    "required": ["householdSize"]
  }
}

// estimate_child_support → ChildSupportInput
{
  "name": "estimate_child_support",
  "input_schema": {
    "type": "object",
    "properties": {
      "netMonthlyResources": { "type": "number", "description": "Obligor monthly net resources per §154.061–154.070." },
      "childrenBeforeCourt": { "type": "integer", "minimum": 1 },
      "otherChildren": { "type": "integer", "minimum": 0, "default": 0 },
      "capOverride": { "type": "number", "description": "Override the statutory net-resources cap." }
    },
    "required": ["netMonthlyResources", "childrenBeforeCourt"]
  }
}

// screen_pi_sol → PiSolInput
{
  "name": "screen_pi_sol",
  "input_schema": {
    "type": "object",
    "properties": {
      "incidentDate": { "type": "string", "description": "YYYY-MM-DD of the triggering event." },
      "claimType": { "type": "string", "description": "PiClaimType enum value." },
      "treatmentEndDate": { "type": "string", "description": "Med-mal only: date treatment ended." }
    },
    "required": ["incidentDate", "claimType"]
  }
}
```

`dispatchTool` result shape:

```ts
{ forModel: string,       // format…(result) + disclaimer, what the model reads back
  fact?: EstimateFact,    // …ToFact(result), offered for Living File write
  urgency?: string,       // e.g. PiSolResult.urgency, for the synthesizer
  raw: object }           // the full typed result, persisted
```

### 4.3 Phase 2 — generative / side-effecting (gated)

| Tool | Wraps | Side effect |
|---|---|---|
| `draft_document` | wizard generation prompt | emits `---DRAFT---` → drafts panel |
| `request_document` | `requested_attachments` insert | adds a "still needed" item |
| `fill_gov_form` | gov-form instrument flow | starts a form fill |
| `update_living_file` | `parseAndUpdateFile` | commits facts/strategy |
| `assess_matter` | §5 synthesizer | returns the prioritized buckets |

---

## 5. Architecture B — `matter_tasks` + synthesizer

### 5.1 The unified task shape

```ts
type MatterTaskStatus = "done" | "doable_now" | "blocked";
interface MatterTask {
  id: string;
  title: string;
  status: MatterTaskStatus;
  blockedBy?: string[];     // named missing facts/documents, when blocked
  toolName?: string;        // the orchestrator tool that would do it, if any
  urgency: "expired" | "critical" | "warning" | "normal";
  impact: "high" | "medium" | "low";
  reason?: string;
}
```

### 5.2 Transform (deterministic, no model)

`lib/matter-tasks.ts`: `buildMatterTasks(input) => MatterTask[]`, computed from
`computeMissionControl(input)` plus the calculators that expose deadlines:

- `MissionAction.status: done` → `done`.
- `status: blocked` → `blocked`, `blockedBy` from the action's missing-fact ids.
- `status: open` → `doable_now` if all inputs a mapped tool needs are already in the
  Living File, else `blocked`.
- Urgency seeded from `screenPiSol().urgency` and any date-based deadlines; impact
  from `MissionAction.priority`.

This grounds the synthesizer — tasks come from deterministic gaps, never invented.

### 5.3 The synthesizer

`assess_matter` (both an orchestrator tool and a thin `/api/...` endpoint for a
passive panel). It takes `buildMatterTasks(...)` + Living File + drafts and produces
the bucketed, prioritized read: **Done / Doable now / Blocked**, ranked by urgency
then impact. The model *phrases and orders*; the task list *bounds* it.

### 5.4 Surfacing

- **In chat:** "what should I do next / where do I stand" → model calls
  `assess_matter` → renders the buckets; each *doable-now* item links to the tool
  the orchestrator can run next. This is the loop-closer.
- **On the Living File (optional, later):** a deterministic "Where things stand"
  card straight from `buildMatterTasks` (no model), which the orchestrator can
  elaborate on demand.

---

## 6. Guardrails & safety

- ACP/privilege constraints from the freestyle prompt carry verbatim into the
  orchestrator system prompt.
- Calculators deterministic; estimates always carry their statutory disclaimer;
  anything the user would file/sign stays a working draft until attorney review.
- `MAX_TOOL_ITERATIONS` cap; per-turn tool-call cap; `detectAcpAreas` keeps only the
  relevant law modules loaded per turn to bound cost/latency.
- Generative + fact-writing tools require confirmation or route through the existing
  review gates; no silent document submission.
- Attorney-user accounts: same tool gating as today (no self-review queue).

---

## 7. Open decisions

1. **Fact auto-write vs. propose.** Default proposed above is *propose*. Alternative:
   auto-write estimate facts flagged `provenance: ai_estimate` and let the attorney
   prune. Decision affects `dispatchTool` and `update_living_file`.
2. **Persist `matter_tasks`** as a table (history/trend) vs. compute on the fly each
   render. Default: compute on the fly first; persist only if we need history.
3. **Tool-result UI.** Inline chips + a compact result card is the plan. Do estimate
   results also get a saveable "add to my file" affordance in the transcript?
4. **`orchestrator` mode vs. reusing `freestyle`.** Reusing `freestyle` is simplest;
   a separate flag lets us keep a tools-off freestyle if desired.

---

## 8. Phases & acceptance criteria

**Phase 1 — Synthesizer (first). ✅ Shipped.**
`lib/matter-tasks.ts` (`buildMatterTasks`, unit-tested) + `/api/assess-matter`
endpoint (deterministic buckets + a grounded narrative) + a "Where things stand"
card on the consumer Living File. Buckets derive only from `computeMissionControl`
and finalized records — no invented tasks. Deferred to a later pass: seeding urgency
from `screenPiSol()` deadlines (needs structured incident-date facts), and exposing
`assess_matter` as an orchestrator tool (Phase 3).

**Phase 2 — Agentic loop + read-only tools. ✅ Shipped.**
`lib/orchestrator-tools.ts` (5 tools: means test, child support, PI SOL, spousal
maintenance, defamation screen — thin wrappers over the pure libs) + the loop in
`chat-acp` (unified path: runs once with no tools in intake, iterates with tools in
freestyle, `MAX_TOOL_ITERATIONS` cap) + `\x02TOOL:…\x02` stream markers rendered as
running chips in the consumer chat + `orchestrator_tool_calls` audit table. Tools are
read-only; missing/invalid params return a structured "need" the model relays; a
thrown tool never fails the turn. The remaining calculators (property split,
possession, exemptions, probate, fault) are one registry entry each — deferred only
because their inputs are arrays/format-less and need a little schema work.

**Phase 3 — `assess_matter` as a tool. ✅ Shipped.**
Shared `lib/matter-assessment.ts` (`loadMatterTasks` + `formatMatterTasks`) feeds
both the `/api/assess-matter` endpoint and a new `assess_matter` orchestrator tool.
`dispatchTool` is now async and context-aware (`{ db, userId, caseFileId }`); the
calculators ignore ctx, `assess_matter` reads the file. The system guidance tells
the model to call `assess_matter` for "what's next / where do things stand" and then
offer to run a calculator when a doable item calls for one. Integration-tested with
a mocked db.

**Phase 4 — Generative tools (gated).**
`draft_document` (→ drafts panel), `request_document`, `fill_gov_form`,
`update_living_file`. AC: a drafted document lands in the panel and can be promoted to
review; fact writes are confirmed, not silent.

---

## 9. File change map

- `lib/orchestrator-tools.ts` — new: tool defs + `dispatchTool`.
- `lib/matter-tasks.ts` — new: `buildMatterTasks` transform + types.
- `app/api/chat-acp/route.ts` — freestyle branch becomes the agentic loop.
- `app/api/assess-matter/route.ts` — new: synthesizer endpoint (also a tool).
- `supabase/schema-stage42-orchestrator.sql` — new: `orchestrator_tool_calls`.
- `app/chat/page.tsx` — render tool-status chips + estimate result cards.
- `lib/prompts.ts` — orchestrator system-prompt additions (tool-use discipline).
- Unchanged/reused: every `*-calc` / `*-assessment` lib, `computeMissionControl`,
  `freestyle-drafts.ts`, the drafts panel, the Living File extractor.
