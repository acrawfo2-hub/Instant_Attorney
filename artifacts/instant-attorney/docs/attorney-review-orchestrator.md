# Attorney Review Orchestrator

Living spec for moving the attorney document-review flow from a fixed button
"rail" to an orchestrator-driven, auto-running pipeline that produces structured,
individually-actionable artifacts and hard QA guarantees.

Status: **Phases 1–2 and independently addressable QA checks landed.** This document is the reference for the whole
multi-phase build; each phase ships independently.

---

## Why

Today, review is a linear sequence of manual one-shot endpoints on
`/attorney/review/[id]`:

1. **Run Critical Review** → one Sonnet call → a ~900-word prose memo
   (`critical_review` child doc).
2. Type **Second Draft Instructions** + **Comments** → **Generate 2nd Draft** →
   fitness check + one Opus call → `second_draft` child + a plain-text changelog.
3. **Ask for a Change** (targeted chat-edit) loops on the second draft.
4. **Approve** (delivers, emails client) or **Request Changes** (emails notes).

Nothing runs automatically on submission, and there is **no citation
verification, no formatting/court-rules QA, and no client-email drafting**. The
prompts say "never invent a citation" but nothing checks.

## Target

On submission, a review **run** auto-kicks off and drives the whole pipeline as a
background job, producing structured artifacts the attorney works over (rather
than a set of buttons the attorney must trigger in order):

1. **Issue-spotting → `improvements[]`** — structured findings (JSON, **≥3,
   unbounded**), each individually accept/reject/edit-able and keyed to a section.
   This is the source of truth; the prose memo is rendered from it.
2. **Revised draft** — applies the improvements to produce the `second_draft`
   child, changes keyed back to improvement IDs.
3. **Hard QA gates** — run as tools over the revised draft:
   - **Authorities** — extract every citation; verify statutes against our
     grounded registries and verify cases via live web search; **strip anything
     unverifiable and raise it as a blocking question.** Approve is locked until
     every citation resolves. *(The "no mis-identified cases, ever" guarantee.)*
   - **Formatting / court-requirements** — check against a curated standards
     registry (per `doc_type` × jurisdiction) with a web-search fallback for
     local rules not yet in the registry.
4. **Attorney memo (structured)** — three sections: *what the document does for
   the client* · *main changes* · *key concerns/risks* — plus a generated
   **client email** in the attorney's voice.
5. **Open questions[]** — anything the AI needs, each with 2–4 one-click proposed
   answers + free text; answering feeds back into a targeted re-revise and
   re-runs only the affected gates.

### Locked decisions

- **Auto-run depth:** full pipeline on submit (improvements → revised draft → all
  QA gates → memo → client email), so the workspace is fully populated when the
  attorney opens it. Guarded by a per-document run cap + usage metering.
- **Case citations:** verify-or-strip. Statutes cited by plain meaning (verified
  against registries); cases only when load-bearing **and** web-search-verified,
  else stripped and raised as a blocking question. Approve blocked until resolved.
- **Standards source:** curated registry we control + web-search fallback for
  local court rules.
- **Client email:** drafted, editable, and **sent in-app** via the existing
  Resend integration, logged to the file.

## Architecture

Reuse the `chat-acp` tool-loop engine (`dispatchTool` / `READ_ONLY_TOOLS` /
`buildFileContext`), the `second_draft`/`critical_review` child mechanics
(`upsert*Child`), the `finalizeDocumentSubmission` choke-point, Resend
(`notify.ts`), `usage-tracker`, and `truncation-logger`.

### Execution model

Replit autoscale (no Vercel, no dedicated queue). On submission,
`finalizeDocumentSubmission` inserts a `document_review_runs` row (`queued`) and
fires processing without blocking the client's request. The processor
(`runDocumentReview`) uses the **service client**, sets `running`, executes the
stages, and lands `complete` / `failed`. Resilience: the attorney review page
can (re)start a run via `POST …/review-run` if the fire-and-forget was cut off —
so a dropped background job self-heals when the page is opened. Re-runs are
idempotent (replace children + improvements for the run).

### Data model (additive)

- **`document_review_runs`** — one per run: `document_id`, `case_file_id`,
  `status` (queued|running|awaiting_attorney|complete|failed), `stage`, `error`,
  token usage, timestamps.
- **`document_improvements`** — structured findings: `run_id`, `document_id`,
  `seq`, `section`, `severity`, `kind`, `title`, `rationale`, `proposed_change`,
  `status` (proposed|accepted|rejected|superseded).
- *(later phases)* `document_review_questions`, `document_qa_checks`,
  client-email storage.

### APIs

- `POST /api/attorney/documents/[id]/review-run` — start/re-run (also the
  self-heal path). `GET` — live run state (improvements + revised draft + run).
- *(later)* `…/questions/[qid]/answer`, `…/improvements/[iid]`,
  `…/qa/[gate]/rerun|waive`, client-email send.
- Keep `chat-edit`; keep `approve` (later gated on QA state).

## Phased rollout

1. **Auto-kickoff + structured improvements + revised draft.** ✅ done (stage44)
2. **Authorities QA gate + Approve gating.** ✅ done (stage45) — the "no bad cases" guarantee
3. **Structured memo + client email (send in-app).** ← next
4. **One-click questions loop.**
5. **Formatting/court-requirements gate + side-by-side diff workspace.**

### Structured QA checks (schema-stage48)

The active `second_draft` revision can now be checked independently for factual
consistency, completeness, defined terms/cross-references, blanks/execution,
formatting/court requirements, client comprehension, and authorities. Findings
record type, severity, location, evidence, disposition, and revision. Clean check
runs are recorded separately so **Re-run affected** also works when a prior check
had no findings. Curated formatting standards are preferred; missing registry
coverage invokes official-source web search and is explicitly reported as
unvalidated when the controlling rule cannot be established. Automated results
and reasoned attorney waivers remain distinct audit events.

### Phase 2 as built (Authorities gate, schema-stage45)

- Runs as **stage 3** of the auto-run (`runAuthoritiesGate`), on a **low-cost model
  (Haiku)** to minimize spend: one extraction call (formal citations only — plain-
  meaning references are ignored) + one **batched** web-search verification call
  (skipped entirely when the draft cites nothing, which is the common case).
- Each citation → a `document_qa_citations` row with a verdict (`verified` /
  `unverified` / `unsupported` / `error`). Verification failure marks `error`,
  which blocks — failing safe.
- **Approve is gated**: `/api/documents/[id]/approve` refuses while any citation is
  not `verified` and not waived. The attorney can **waive** a citation one-click
  (`PATCH …/citations/[citationId]`) as a deliberate "I checked this myself"
  override. UI: an Authorities panel on the review page + a block banner on Approve.
- Server-tool (web_search) fees are metered via `usage-tracker` with
  `server_tools: true` so the spend stays visible on the admin dashboard.
- Not yet: auto-*stripping* an unverified cite from the draft (currently flag +
  block + waive); that re-draft pass is a follow-up.

## Phase 1 scope (this change)

- `document_review_runs` + `document_improvements` tables + RLS
  (`schema-stage44-*`).
- `lib/attorney-review.ts` — `runDocumentReview()` orchestrator: stage 1
  (structured improvements, ≥3) → stage 2 (revised draft applying them). Prompts
  live in `lib/prompts.ts`.
- `POST/GET /api/attorney/documents/[id]/review-run`.
- Auto-kickoff wired into `finalizeDocumentSubmission`.
- Additive UI on the review page: a run-status strip + the structured
  improvements list + the auto-generated revised draft, without removing the
  existing manual controls (retired in later phases as the workspace lands).

Not in Phase 1: QA gates, questions loop, memo/email, the three-pane diff UI.
