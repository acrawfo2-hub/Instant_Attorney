---
name: Instant-Attorney document wizard — push-forward flow
description: Why answering wizard questions auto-sends to the attorney, and the status-preservation rule on draft edits
---

# Document wizard is biased toward pushing the doc forward

> **⚠️ Describes a surface being retired.** The product moved to the
> orchestrator model; the wizard is scheduled for removal in Phase 5 of
> `docs/orchestrator-migration-plan.md`. Still accurate for the wizard as it
> exists today — do not use it as a reason to keep or extend the wizard. See
> `instant-attorney-orchestrator-migration.md`.

**Decision:** Answering a round of checklist questions in the client wizard
**updates the draft AND auto-sends it to the attorney** (status → `pending_review`),
leaving unanswered fields as highlighted `[[placeholders]]`. Clients are not
required to answer everything, and there is no separate "save a private draft"
step.

**Why:** A real client answered ~90% of questions; the draft updated but only
saved as a local `draft` she never separately submitted — so it looked like no
progress was made and she couldn't find it. The firm's rule: the attorney would
rather receive an imperfect doc and fill gaps / follow up than have it stranded.

**How to apply:**
- The combined action lives in `handleSubmitAnswers` (regenerate → `submitToAttorney`).
- Because React state is async, read the just-saved doc id from a **ref**
  (`docIdRef`), not the `documentId` state, when submitting inside the same handler.
- An explicit "send as-is" button still exists for clients with nothing to add;
  if they have typed-but-unsent answers it routes through `handleSubmitAnswers`
  first so answers aren't lost.

# Wizard route must NOT downgrade an elevated doc to "draft" on edit

**Rule:** When `app/api/wizard/route.ts` updates an existing document, preserve its
current lifecycle status. Only a brand-new row or a `pre_warmed` suggestion becomes
`draft`; `pending_review` / `changes_requested` / `approved` / `delivered` are kept.

**Why:** The route previously hard-set `status: "draft"` on every save. Editing an
already-submitted doc would silently pull it out of the attorney's queue and hide
the client's progress, and would break `finalizeDocumentSubmission`'s
`changes_requested` → resubmit path (which clears stale critical_review/second_draft
children). Duplicate attorney notifications are prevented by that function's
`alreadyQueued` guard, so re-submitting a `pending_review` doc is idempotent.
