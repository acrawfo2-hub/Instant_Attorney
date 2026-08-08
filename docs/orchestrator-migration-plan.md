# Orchestrator Migration — Sequenced Plan

**Status:** proposed, not yet started
**Audience:** Replit Agent (implementation + QA), Andrew Crawford (product decisions)
**Source:** codebase audit, 2026-08-08, against `main` @ `d970ec7`; refreshed
against `f4cc98c` (draft-in-progress indicators)

> **Line numbers drift.** Anchor on the quoted symbol or string, not the `:NNN`.
> The `f4cc98c` indicator work already shifted `CaseDocumentsTable` by ~50 lines.

---

## The one-paragraph version

The product moved from guided **drafting wizards** to a single **orchestrator**
conversation. The orchestrator half is built and working. What remains is
archaeology: the wizard-era intake prompt is still prepended to every
orchestrator turn (and contradicted by an override appended after it), a handful
of client-facing links still exit into `/wizard/...`, two parallel draft systems
are visible side by side on the file, and the roadmap UI subtree is fully dead
while its backend still runs a DB query on every dashboard render.

Nothing here is a rewrite. It is five phases of subtraction, ordered so the
highest client-facing impact lands first and the riskiest deletion lands last.

---

## Baseline (verified 2026-08-08)

| Check | Result |
|---|---|
| `npm test` (from `artifacts/instant-attorney`) | **661 / 661 pass** |
| `npm run typecheck` | **1 failure**, pre-existing and unrelated — see Phase 0 |
| Supabase DDL for every table/column the code touches | **all present** |
| `schema-verify.sql` coverage | **stops at stage 37** — see Phase 0 |

Re-establish this baseline before starting and after each phase. A phase is not
done until tests are green and typecheck is no worse than baseline.

---

## Constraints the implementer must respect

These are load-bearing. Violating any one of them has already cost a wrong turn
on this codebase.

1. **`artifacts/instant-attorney` is npm-isolated.** It is excluded from the
   pnpm workspace and has its own `package-lock.json`. Run `npm run typecheck`
   and `npm test` **from that directory**. Root `pnpm -r` does not cover it.
2. **`.replit-artifact/artifact.toml` `paths` decides API routing.** The Express
   `api-server` owns `/api`; any `/api/<x>` not listed in that array falls
   through to Express and the Next route becomes unreachable. `/api/roadmap` and
   `/api/wizard` are both currently listed. **Edit that file via the artifacts
   skill, never by hand.**
3. **Do not re-add document pre-warming.** Permanently retired (stage 13).
4. **`lib/wizard-parsing.ts` cannot be deleted with the wizard.** Its
   `placeholderFields` export is imported by six live orchestrator-era files
   (`app/chat/page.tsx`, `ClientFileView`, `file-parser`, `roadmap-build`,
   `doc-generator`, `app/api/documents/[id]/route.ts`). It is shared
   infrastructure now, not wizard code.
5. **Leave `roadmap_snapshots` (the table) alone.** Phase 4 removes the code
   that reads it. Dropping the table is a separate, data-destructive decision
   and is explicitly out of scope here.
6. **`intake` chat mode is unreachable from the UI**, but the API still accepts
   it. `/api/chat-acp` has exactly one caller — `app/chat/page.tsx:744` — and it
   always sends `mode: "freestyle"`.

---

## Phase 0 — Unblock the gates (do first, ~30 min)

Two small items that make every later phase verifiable.

### 0.1 Fix the typecheck failure

`artifacts/instant-attorney/lib/stripe.ts:8` pins
`apiVersion: "2026-06-24.dahlia"`, but the installed `stripe@22.4.0` types
expect `"2026-07-29.dahlia"`. This is unrelated to the orchestrator work, but it
means the typecheck gate is red today and cannot be used to prove a later phase
is clean.

Bump the pin to match the installed types. Do not upgrade or downgrade the
`stripe` package to work around it.

### 0.2 Close the Supabase verification gap

`supabase/schema-verify.sql` verifies through **stage 37** and covers **none** of
stages 38–45 — which is every orchestrator-era object. The DDL files all exist
and are correct; what was missing was any way to confirm the live database has
them applied. There is no automated migration runner on this project (SQL is
applied by hand in the Supabase SQL editor), so an unapplied stage fails
*silently* at runtime with PGRST205 rather than at deploy time.

The concrete risk: if `client_workspace_drafts` were missing from the live DB,
every `---DRAFT:---` block the orchestrator emits would be discarded after the
stream completes, with no error shown to the client.

**Already added by this change:** `supabase/schema-verify-stage38-45.sql` —
read-only, idempotent, safe to re-run. Run it in the Supabase SQL editor after
`schema-verify.sql`. Every row should read `OK`; any `MISSING` row names the
migration file to apply in its `fix` column.

**This is the "are we good to go in Supabase?" gate. Run it before Phase 1.**

---

## Phase 1 — Prompt surgery (highest impact, no schema change)

**Why first:** this is what actually degrades the client experience, it is
invisible to tests, and it is pure text editing in one file
(`artifacts/instant-attorney/lib/prompts.ts`).

Today `buildAcpSystemPrompt(areas, persona, {mode: "freestyle"})` composes:

```
intake core head  →  area index  →  deep dives  →  intake core tail  →  freestyle override
    (~2.0K tok)                                        (~1.0K tok)          (~1.9K tok)
```

The override's job is largely to cancel the head and tail. Prompt-order
supersession is a soft guarantee: under a long conversation or a tool-heavy
turn, the earlier instruction is a live attractor.

### Direct contradictions to resolve

| Still instructs (line) | Override says |
|---|---|
| `:251` "One focused question at a time. **Never** stack multiple questions" | "there is no default 'ask one thing first'… Batch your remaining questions" |
| `:555` "high level only — **do not give definitive legal advice**" | `:683` "This SUPERSEDES the intake rules about staying 'high level only'" |
| `:240` "Your purpose: … **patiently gathering facts**" | "The client came to get something DONE today" |
| `:272` "typically 4–8 exchanges for the first session" | pace to the client, no fixed cadence |

### Not contradicted anywhere — the clearest wizard leak

`lib/prompts.ts:312-319`, **`Wizard recommendation rules`**, still explicitly
instructs the model to recommend `demand_letter`, `complaint_letter`,
`draft_contract`, `draft_waiver`, `wills_trusts`, `doc_review`. Nothing in the
freestyle block cancels it. This is why the assistant can still name wizards to
a client who has no wizard to go to.

### The work

Because intake mode is unreachable from the UI (constraint 6), do **not** add a
third layer of overrides. Restructure instead:

1. Split `buildAcpCoreHead` / `buildAcpCoreTail` into a **shared** part
   (identity, privilege, jurisdiction, `[URGENT:]`, Living File / strategy /
   requested-attachments / government-forms block formats, evidentiary tagging,
   the proof lens) and an **intake-only** part (one-question-at-a-time, the 4–8
   exchange cadence, "high level only / no definitive advice", "patiently
   gathering facts").
2. Build the freestyle prompt from **shared + freestyle behavior** only. The
   intake-only part is never emitted on the freestyle path.
3. Delete `Wizard recommendation rules` outright. It has no orchestrator meaning.
4. Keep `DOCUMENT PLAN` emission **for now** — Phase 2 depends on it still being
   written. Retire it in Phase 3, not here.
5. Shrink the override to what it should be — a statement of how the
   orchestrator works — rather than a rebuttal of instructions that no longer
   appear above it.

**Decision needed from Andrew:** do we keep an intake code path at all? If not,
this phase gets meaningfully smaller and `ChatMode` / `case_files.chat_mode` can
be retired in Phase 5. Recommendation: keep the type and column, delete the
prompt branch — cheap insurance, no ongoing cost.

### QA for Phase 1

Prompt regressions do not show up in unit tests. These must be driven by hand
against a real case file, on a **tester account** (`lib/testers.ts`).

| # | Scenario | Pass condition |
|---|---|---|
| 1.1 | Ask a substantive legal question with facts already on file | Gives a real read on the law and a recommended course of action. **Fails if** it hedges, says "you should consult an attorney", or stays deliberately high-level |
| 1.2 | Reply tersely / "just tell me" | Stops asking and gives its read. **Fails if** it continues one-question-at-a-time |
| 1.3 | Ask "what should I do next?" | Calls `assess_matter`, answers with the top one or two items. **Fails if** it recites the whole board or names a wizard |
| 1.4 | Ask for a document | Emits a `---DRAFT:---` block that lands in the side panel, with `[[blanks]]` and a short ranked question list after it |
| 1.5 | Long session (15+ turns), then ask a hard question | Still candid. This is the regression that matters most — the old guardrails resurface late, not early |
| 1.6 | Read back 5 transcripts | Word "wizard" never appears in assistant output |

---

## Phase 2 — Close the client-facing wizard exits

**Why second:** these are the visible contradictions. A client who asks the
orchestrator what to do next, then sees a wizard link on their file, gets two
different answers to the same question.

### 2.1 `components/CaseHub.tsx:23-24` — the important one

The consumer's "Where things stand" block renders each task title as a link to
`t.href`. That href traces:

```
CaseHub → buildMatterTasks (lib/matter-tasks.ts:233)
        → computeMissionControl (lib/mission-control.ts)
        → computeNextStep (lib/next-step.ts)
        → planItemHref()  →  /wizard/<engine>?caseFileId=…
```

So the top task on the client's file is a wizard link, surfaced at the exact
moment of highest intent.

**Fix:** point client-mode task hrefs at the orchestrator
(`/chat?caseFileId=<id>`) with the task as opening context, or render the title
as plain text and let the single "Continue with your assistant" CTA carry the
action. Prefer the second — one obvious next step beats two competing ones.

**Already correct, do not "fix":** `formatMatterTasks`
(`lib/matter-assessment.ts:38-50`) strips hrefs before the model sees them, so
`assess_matter` never shows the orchestrator a wizard URL. The leak is UI-only.

### 2.2 `components/CaseDocumentsTable.tsx` — the `cdt-ghost` "Continue →" link

A `documents` row in `draft` status renders "Continue →" into
`/wizard/{doc_type}` (`:648` as of `f4cc98c`). Route it into the orchestrator
with the document opened in the drafts panel instead — the `cdt-open-draft` link
a few hundred lines above (`:428`) already does exactly this for workspace
drafts (`/chat?caseFileId=…&draft=…`). Reuse that shape.

### 2.3 The six area tool pages

`/debt/rights`, `/personal-injury/rights`, `/tax/guidance`,
`/employment/claim-check`, `/employment/noncompete`, `/defamation/assess` each
build a `wizardHref` CTA when a `caseFileId` is present.
`app/dashboard/page.tsx:274-386` links 14 such pages.

Every calculator behind these pages is **also** an orchestrator tool. That makes
them a parallel front door with a wizard exit.

**Decision needed from Andrew.** Three options, in order of preference:

- **(a)** Keep the pages as marketing / self-serve calculators, but change the
  post-result CTA from the wizard to the orchestrator. Cheapest, preserves SEO
  and the unauthenticated funnel.
- **(b)** Keep them for logged-out visitors only; logged-in users land in chat.
- **(c)** Retire them. Largest deletion, loses the unauthenticated entry points
  that `app/page.tsx` drives traffic to.

Recommendation: **(a)**. These pages are cheap, deterministic, and do useful
top-of-funnel work; only their exit is wrong.

### QA for Phase 2

- Every task title in "Where things stand" leads to chat or is inert. No
  `/wizard/` in any client-mode `href` — grep the rendered HTML.
- A file with a `draft`-status document shows a working "Continue" that opens
  the orchestrator with that document in the panel.
- Attorney view is unchanged — Mission Control still renders and still works
  (`ClientFileView.tsx:269` gates it to `isAttorney`).
- Draft-in-progress indicator: start a document in chat, navigate to the case
  file page — the banner appears, then clears and the drafts list refreshes when
  the turn completes. Then start a turn from a second tab **while already
  sitting on the case file page** — this is the case defect 2.4.2 currently
  misses, and the regression test for that fix.
- `/wizard/demand_letter` still loads for a signed-in user (it is not being
  removed in this phase; `e2e/auth-redirects.spec.ts:12` asserts its auth gate).

---

### 2.4 Follow-up on the draft-in-progress indicators (`f4cc98c`, `a3caa5b`)

Two "a draft is being written" indicators landed after this plan was drafted:
one in `CaseDocumentsTable` (case file page) and one in `CaseBrainstormChat`
(attorney file page). Both poll `/api/chat-acp/status?caseFileId=…`.

**The direction is right** — both treat the orchestrator as the thing that
produces drafts, which is exactly where this migration is going. Three defects
to fold into this phase rather than fix separately:

1. **The `CaseBrainstormChat` chip can never render.** `CaseBrainstormChat` is
   mounted only at `app/attorney/file/[caseFileId]/page.tsx:157` — the
   supervising attorney's view of a *client's* file. The status endpoint
   ownership-checks `job.userId !== userId` and returns
   `{running:false, done:false}` on mismatch. The job belongs to the client; the
   viewer is the attorney. It always short-circuits.
   Beyond the ownership check it is also the wrong pipeline: that panel is the
   attorney's private sounding board (`/api/attorney/case-files/[id]/brainstorm`),
   not chat-acp, so a chip reflecting the client's consumer turn would be
   confusing even if it did render. **Recommendation: remove it.**
2. **The poll loop is one-shot.** In both components, the `else` branch (not
   running) sets state and returns *without rescheduling*, so the loop dies on
   the first non-running response. The indicator can only ever appear for a turn
   that was already running at mount. The primary path (start a turn in chat →
   navigate to the case file) works, because the job is running at mount; a turn
   that starts later is never picked up. Reschedule in both branches, with a
   longer idle interval.
3. **`wasRunning` is a stale closure.** In `CaseDocumentsTable`,
   `const wasRunning = draftInProgress;` captures the value from effect creation
   (always `false`, deps are `[caseFileId]` with exhaustive-deps disabled). The
   condition reduces to `data.done`, which happens to be correct — so this is
   dead code that reads as logic. Drop it, or move the flag to a ref.

Minor, no action required: on mount with a *finished* job still in the registry
(15-min TTL, `lib/acp-jobs.ts`), `CaseDocumentsTable` fires one spurious
`load()` + `router.refresh()` per page load until the job is swept.

**Note for Phase 3:** these indicators only know about orchestrator turns, so a
wizard-generated draft gets no indicator. One more asymmetry between the two
draft systems, and one more argument for converging them.

## Phase 3 — Converge the two draft systems

**Why third:** it depends on Phase 2 having removed the client's routes *into*
the wizard, and it is the phase with a real product decision inside it.

| | Orchestrator | Wizard |
|---|---|---|
| Store | `client_workspace_drafts` | `documents` |
| Protocol | `---DRAFT: title---` | `---DRAFT READY---` + `MISSING FACTS` + `FOLLOW-UP` |
| Parser | `lib/freestyle-drafts.ts` | `lib/wizard-parsing.ts` |
| Fill UI | `WorkspaceDraftInfoNeeded` | `DocumentInfoNeeded` |
| Standard | `DRAFTING_DISCIPLINE`, 4 bullets | `buildDrafterSystemPrompt`, ~1100 words |
| Blanks | `[[…]]` | `[[…]]` — already converged |

Both render side by side in `CaseDocumentsTable` with different actions ("Send
for review" vs "Continue →"), and nothing explains the difference to the client.
A document's quality bar currently depends on which door it came through.

**The real gap is quality, not plumbing.** `buildDrafterSystemPrompt` carries
things `DRAFTING_DISCIPLINE` does not: the blocking / non-blocking taxonomy, the
6-step draft-then-audit workflow, the plain-text/no-Markdown formatting contract,
the "draft to the client's goals" organizing principle, and the evidentiary
hedging rules for `asserted` vs `established` facts.

**Recommended approach:** port those into `DRAFTING_DISCIPLINE` so the
orchestrator drafts to the same standard, rather than keeping the wizard
pipeline alive to get a better draft. Then the wizard is genuinely redundant.

Sequencing within the phase:

1. Port the drafting standard into `DRAFTING_DISCIPLINE`. Ship. QA drafts
   against the wizard's output as the benchmark.
2. Only once orchestrator drafts match or beat wizard drafts, mark
   `/wizard/[type]` deprecated in the UI.
3. Retire `DOCUMENT PLAN` emission (deferred from Phase 1) and stop writing
   `legal_strategy.recommended_wizards` / `document_plan` in `lib/file-parser.ts`.
   **Read paths must keep tolerating existing rows** — historical files have
   these populated and must not break.

### QA for Phase 3

- Draft the same instrument through both doors on the same case file; compare.
  Orchestrator output must be at least as good on: correct blocking vs
  non-blocking blanks, no Markdown symbols, defined terms used consistently, no
  invented facts, hedged language on `asserted` facts.
- Fill blanks inline in the drafts panel → "Send for review" → confirm it lands
  in the attorney queue with status `pending_review`.
- Promote the same draft twice — must be idempotent, one document, no duplicate
  review row (`app/api/workspace/drafts/[id]/promote/route.ts` handles this).
- Open a case file created **before** this change with a populated
  `document_plan` — the file must render without errors.

---

## Phase 4 — Delete the dead roadmap subtree (low risk, satisfying)

Confirmed by import analysis — **zero** importers anywhere, including tests.

**14 dead components.** `RoadmapSpine`, `RoadmapToolGroup`, `GenericRoadmap`,
`PiRoadmap`, `FamilyRoadmap`, `BankruptcyRoadmap`, `EmploymentRoadmap`,
`NextStepGuide`, `AttachmentPanel`, `GovFormInstruments`, `MatterStandingCard`
have no importer at all. `RoadmapPanel`, `RoadmapRefresh`,
`RoadmapConsultNudge` are reachable only from `RoadmapSpine`, itself dead.

**1 dead lib.** `lib/case-cta.ts` — no production importer; only its own passing
test, which asserts wizard hrefs. Delete both.

**2 dead API routes.** `/api/roadmap/refresh` and `/api/roadmap/assert` — the
only callers were the dead components. Removing them means removing
`/api/roadmap` from `artifact.toml` `paths` — **via the artifacts skill**
(constraint 2).

**A wasted query on every dashboard render.**
`app/dashboard/[id]/page.tsx:84` queries `roadmap_snapshots`, `:142` parses the
overlay, `:225` passes it to `ClientFileView` — where it is destructured at
`:77` and **never read**. Remove the query, the parse, the prop, and the
`RoadmapAiOverlay` import at `ClientFileView.tsx:16`.

**Retained deliberately:** the `roadmap_snapshots` table (constraint 5), and
`lib/roadmap-*.ts` until the routes are gone — then they can go too, except
confirm nothing else imports `roadmap-build` (it imports `placeholderFields`,
not the reverse).

Careful: `components/NextStepGuide.tsx` is dead, but `lib/next-step.ts` is very
much alive via `mission-control` → `matter-tasks` → `CaseHub`. Do not delete the
lib.

### QA for Phase 4

- `npm run typecheck` and `npm test` green (661 tests; none touch the deleted
  components — `lib/case-cta.test.ts` is deleted with its subject, so expect the
  count to drop by that file's tests, not to fail).
- Dashboard and file views render identically. Diff screenshots before/after.
- `/api/roadmap/refresh` returns the Express 404, not a Next 500 — confirms the
  `artifact.toml` change took. Check for `X-Powered-By: Express`.

---

## Phase 5 — Retire the wizard (only after 1–4 are stable)

Do **not** start this until Phase 3's drafting standard has been in production
long enough to trust. Everything before this is reversible; this is not.

In order:
1. Remove `/wizard` from `middleware.ts:7` `AUTH_REQUIRED` and delete
   `app/wizard/[type]/` (page + layout, 1251 lines).
2. Delete `app/api/wizard/route.ts` and `app/api/wizard/save-answers/route.ts`;
   remove `/api/wizard` from `artifact.toml` `paths` **via the artifacts skill**.
3. Delete `WIZARD_PROMPTS`, `WIZARD_FIELD_HINTS`, `wizardBase`, and the
   `---WIZARD COMPLETE---` protocol from `lib/prompts.ts`.
4. **Keep** `buildDrafterSystemPrompt` — `app/api/attorney/documents/[id]/chat-edit`
   and `app/api/documents/[id]/regenerate` both still use it.
5. **Keep** `lib/wizard-parsing.ts` (constraint 4). Consider renaming it to
   `lib/draft-blanks.ts` so its name stops implying dead code — a rename touches
   ~8 import sites and is worth doing as its own commit.
6. Update `e2e/auth-redirects.spec.ts:12`, which asserts `/wizard/demand_letter`
   redirects when logged out.
7. `WizardType` stays. It is the `documents.doc_type` engine taxonomy and is
   load-bearing in the DB constraint, `execution.ts`, `token-limits.ts`, and
   `doc-generator.ts`. Renaming it is a separate, larger refactor — not part of
   this migration.

---

## Suggested sequencing

| Phase | Effort | Risk | Client-visible improvement |
|---|---|---|---|
| 0 — gates | ~30 min | none | none (enables everything else) |
| 1 — prompts | 0.5–1 day | low code / **high behavioral** | **large** |
| 2 — exits | 0.5 day | low | **large** |
| 3 — drafts | 2–3 days | medium | medium, compounding |
| 4 — dead code | 0.5 day | very low | none (velocity + one less query) |
| 5 — retire wizard | 1 day | **irreversible** | none directly |

Phases 0, 1, 2, and 4 are independent and can ship in any order after 0. Phase 3
depends on 2. Phase 5 depends on 3.

If only one thing ships: **Phase 1.** It is the difference between an
orchestrator that gives real legal advice and one that intermittently reverts to
hedging.

---

## Open decisions for Andrew

1. **Keep an intake code path?** (Phase 1) — recommendation: keep the type and
   DB column, delete the prompt branch.
2. **What happens to the six area tool pages?** (Phase 2) — recommendation:
   keep the pages, change their exit CTA to the orchestrator.
3. **Is the wizard's drafting standard the bar?** (Phase 3) — recommendation:
   yes; port it into the orchestrator rather than keeping the wizard alive to
   reach it.
4. **Ever drop `roadmap_snapshots`?** (out of scope) — recommendation: leave it.
   It costs nothing at rest and holds historical data.
