---
name: Instant-Attorney document staleness ("out of date" + Regenerate)
description: How drafted docs are flagged out of date when facts/hypotheticals change, and the per-document client Regenerate flow.
---

# Document staleness & Regenerate

A drafted document is "out of date" when the client's file changed after the
draft was written. Signal: `documents.facts_synced_at` (timestamptz) vs the
latest `fact_items` change. Detection is a pure helper `isDocumentOutOfDate` in
`lib/types.ts` (with `latestFactChangeAt`).

**Why facts_synced_at, not updated_at:** a document's own `updated_at` also moves
on status changes, so it can't represent "the file state this draft was built
against." A dedicated stamp can.

**Latest fact change = max(fact_items.updated_at ?? created_at).** `fact_items`
has BOTH columns; gap-answer and What-If/apply routes bump `updated_at`, new
facts default both to now(). So a single max over `updated_at` (falling back to
created_at) catches new facts, answered gaps, and revised What-If answers.

## How to apply / invariants
- **Stamp LAST.** Generation routes (`api/wizard`, `api/documents/[id]/regenerate`)
  must call `stampFactsSynced` AFTER `parseAndUpdateFile` + `syncDraftGapsToLivingFile`
  — those write facts during generation; stamping before would re-flag the draft
  out of date from its own side effects.
- **Graceful degradation is mandatory.** `facts_synced_at` is a manual Supabase
  migration (`schema-stage18-doc-facts-synced.sql`). `stampFactsSynced`
  (in `lib/document-utils.ts`) swallows a missing-column error so a draft never
  fails to save. `isDocumentOutOfDate` treats null/undefined synced-at as NOT
  stale — so nothing is falsely flagged before the migration runs.
- **Client-only + non-finalized.** Flag/Regenerate never show in attorney mode,
  and never for `approved`/`delivered` (attorney work product is the deliverable).
  Regenerate route allows only `draft`/`changes_requested`/`pending_review` and
  rejects child docs (parent_document_id) and non-WizardType doc_types.
- **Regenerate preserves status** (must NOT downgrade a doc already with the
  attorney back to "draft") — mirrors the wizard `resolveWizardDocumentTarget`
  rule. It overwrites the SAME doc id in place.
- Regenerate uses sonnet-4-6 + plain JSON (same as wizard), not NDJSON — fast
  enough to clear the proxy idle window; the slow-Opus heartbeat rule doesn't apply.
- UI: the per-doc Regenerate button is a `"use client"` component
  (`RegenerateDocButton.tsx`) kept OUTSIDE the draft-row `<Link>` (button-in-anchor
  is invalid + would navigate). It POSTs then `router.refresh()`.
