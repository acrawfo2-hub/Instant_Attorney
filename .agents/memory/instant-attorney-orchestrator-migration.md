---
name: Wizard → orchestrator migration (in flight)
description: What wizard-era code is still live on purpose, what is dead, and the order to remove it in — read before touching prompts or chat flow.
---

# The product is the orchestrator; wizard code is mid-retirement

The client experience moved from guided drafting **wizards** to a single
**orchestrator** conversation (`app/chat/page.tsx` → `/api/chat-acp`, tool loop
in `lib/orchestrator-tools.ts`). The wizard is still in the tree and still
reachable. **Full sequenced plan with QA gates:
`docs/orchestrator-migration-plan.md`.** Read it before changing prompts, chat
flow, `lib/next-step.ts`, `lib/mission-control.ts`, or anything under
`app/wizard/`.

## The trap: intake guardrails are still prepended to every orchestrator turn

`buildAcpSystemPrompt(areas, persona, {mode})` composes
`intake core head → area index → deep dives → intake core tail → freestyle
override`. The override is appended **last** and exists mostly to *cancel* the
head and tail. Prompt-order supersession is soft, so the old rules resurface in
long or tool-heavy turns. Live contradictions in `lib/prompts.ts`:

- `:251` "One focused question at a time. Never stack multiple questions"
  vs the override's "there is no default 'ask one thing first'".
- `:555` "high level only — do not give definitive legal advice" vs `:683`
  "This SUPERSEDES the intake rules about staying 'high level only'".
- `:312` **`Wizard recommendation rules`** — tells the model to recommend
  `demand_letter` / `doc_review` / etc. **Nothing cancels this one.** It is why
  the assistant can still name a wizard to a client who has nowhere to go.

Do **not** fix these by adding another override layer. Split the core head/tail
into shared vs intake-only and build the freestyle prompt from shared +
freestyle behavior. **`intake` mode is unreachable from the UI** —
`/api/chat-acp` has exactly one caller (`app/chat/page.tsx:744`) and it always
sends `mode: "freestyle"`.

## Client-facing wizard exits that still exist

- `components/CaseHub.tsx:23-24` renders task titles as links to `t.href`, which
  traces `buildMatterTasks` → `computeMissionControl` → `computeNextStep` →
  `/wizard/<engine>`. The top task on the consumer file is a wizard link.
- `components/CaseDocumentsTable.tsx` — the `cdt-ghost` "Continue →" link on a
  `draft` document (`:648` as of `f4cc98c`; line numbers drift, anchor on the
  class name). The `cdt-open-draft` link above it already routes to
  `/chat?caseFileId=…&draft=…` — reuse that shape.
- Six area tool pages (`/debt/rights`, `/personal-injury/rights`,
  `/tax/guidance`, `/employment/claim-check`, `/employment/noncompete`,
  `/defamation/assess`) build a `wizardHref` CTA when a `caseFileId` is present.

Already correct — do not "fix": `formatMatterTasks`
(`lib/matter-assessment.ts:38-50`) strips hrefs before the model sees them, so
`assess_matter` never shows the orchestrator a wizard URL. The leak is UI-only.
Mission Control is already attorney-gated (`ClientFileView.tsx:269`).

## Draft-in-progress indicators (`f4cc98c`, `a3caa5b`) — right idea, three defects

Both poll `/api/chat-acp/status?caseFileId=…`. Right direction (they treat the
orchestrator as the source of drafts), but:

- **The `CaseBrainstormChat` chip can never render.** That component mounts only
  on the *attorney's* view of a *client's* file
  (`app/attorney/file/[caseFileId]/page.tsx:157`), and the status endpoint
  ownership-checks `job.userId !== userId` → always `{running:false}`. It is also
  the wrong pipeline (that panel is `/api/attorney/case-files/[id]/brainstorm`,
  not chat-acp). Remove it.
- **The poll loop is one-shot.** The not-running branch returns without
  rescheduling, so it only ever catches a turn already running at mount.
- **`wasRunning` in `CaseDocumentsTable` is a stale closure** — captured at
  effect creation, always `false`; the condition really reduces to `data.done`.

Tracked as §2.4 of `docs/orchestrator-migration-plan.md`.

## Confirmed dead code (zero importers, verified by import analysis)

14 components: `RoadmapSpine`, `RoadmapPanel`, `RoadmapRefresh`,
`RoadmapConsultNudge`, `RoadmapToolGroup`, `GenericRoadmap`, `PiRoadmap`,
`FamilyRoadmap`, `BankruptcyRoadmap`, `EmploymentRoadmap`, `NextStepGuide`,
`AttachmentPanel`, `GovFormInstruments`, `MatterStandingCard`. Plus
`lib/case-cta.ts` (only its own test) and the `/api/roadmap/*` routes.

`app/dashboard/[id]/page.tsx:84` still queries `roadmap_snapshots` every render
and passes the overlay to `ClientFileView`, where it is destructured at `:77`
and never read — a live DB round-trip feeding nothing.

## Things that LOOK dead but are not — do not delete

- **`lib/next-step.ts`** — alive via `mission-control` → `matter-tasks` →
  `CaseHub`. Only the `NextStepGuide` *component* is dead.
- **`lib/wizard-parsing.ts`** — its `placeholderFields` export is imported by six
  live orchestrator-era files. Shared infrastructure now, despite the name.
- **`buildDrafterSystemPrompt`** — still used by
  `/api/attorney/documents/[id]/chat-edit` and `/api/documents/[id]/regenerate`.
- **`WizardType`** — it is the `documents.doc_type` engine taxonomy, load-bearing
  in the DB check constraint, `execution.ts`, `token-limits.ts`,
  `doc-generator.ts`. Renaming it is a separate refactor.
- **`roadmap_snapshots`** (the table) — leave it; dropping it is data-destructive
  and out of scope.

## Removing an API route means editing artifact.toml

`/api/roadmap` and `/api/wizard` are both in
`artifacts/instant-attorney/.replit-artifact/artifact.toml` → `paths`. Removing
a route without removing its path entry (or vice versa) silently reroutes to the
Express api-server. Edit that file **via the artifacts skill**, not by hand —
see `instant-attorney-routing.md`.

## Ordering

Phase 0 (unblock gates: `lib/stripe.ts` apiVersion pin + run
`supabase/schema-verify-stage38-45.sql`) → 1 (prompts) → 2 (client exits) →
3 (converge draft systems) → 4 (delete dead roadmap subtree) → 5 (retire wizard,
irreversible, only after 3 is stable). 0/1/2/4 are independent; 3 needs 2; 5
needs 3. **If only one ships, ship Phase 1** — it is the difference between an
orchestrator that gives real legal advice and one that intermittently hedges.
