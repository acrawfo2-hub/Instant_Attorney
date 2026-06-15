---
name: Instant-Attorney attorney full-file parity
description: What it takes to let an attorney see EVERYTHING a client sees in their case file
---

# Attorney full-file view = ClientFileView mode="attorney" + two independent unlocks

ClientFileView already supports `mode: "client" | "attorney"`. To give an attorney
true parity (legal strategy, instruments, fact cards, gov forms, documents,
attachments, downloads) you must unlock BOTH layers — they fail independently and
silently:

1. **UI gating inside ClientFileView.** Some subsections are wrapped `{!isAttorney && ...}`.
   Any such gate hides that section from attorneys even when the data/API is fine.
   The consult banner/CTA is *intentionally* client-only (keep it gated); content
   sections like GovFormInstruments must NOT be gated.
2. **Backing API attorney-bypass.** Client-facing API routes hard-filter
   `.eq("user_id", userId)`. For attorney viewing another client's file, detect
   `profiles.is_attorney` and switch to `createServiceClient()` with NO user filter
   (mirror `/api/attachments`). `/api/documents/[id]/download` already allows attorney.

**Server reads:** the attorney file route (`app/attorney/file/[caseFileId]/page.tsx`)
verifies `is_attorney` with the real session (`createClient`) FIRST, then uses
`createServiceClient()` for all reads — this sidesteps incomplete per-table RLS
(fact_items etc.) without needing new SQL.

**Why:** data was never lost; it just wasn't rendered attorney-side. A review caught
that fixing the API alone left GovFormInstruments hidden by a UI `!isAttorney` gate.

**How to apply:** when adding any new section to the client file that an attorney
should also see, check for a `!isAttorney` gate in ClientFileView AND confirm the
section's API route has an attorney service-client bypass.

# Attorney WRITES to client-owned rows must use the service client

The `documents` INSERT RLS policy requires `user_id = auth.uid()`. Attorney review
actions create child documents owned by the CLIENT (`parent.user_id`): the
critical-review child (`doc_type: critical_review`) and the second-draft child
(`doc_type: second_draft`). Inserting these with the attorney's RLS session fails
with Postgres `42501` ("new row violates row-level security policy"). The route
returns 200 with a null child id, so the UI silently shows nothing
(e.g. "No review memo yet. Click Run Critical Review.").

`upsertCriticalReviewChild` / `upsertSecondDraftChild` take the db client as their
first arg — pass `createServiceClient()` (after the is_attorney check) so the child
insert + parent sync bypass RLS. Parent-row UPDATEs (review_status etc.) succeed
under the attorney UPDATE policy, so only the cross-owner INSERTs need the bypass.

**Why:** found via production deploy logs after "Run Critical Review" produced
nothing. The AI generation succeeded; only the save failed.

**How to apply:** any attorney route that INSERTs a row whose `user_id` is the
client's must use the service client for that write. Symptom to grep for in deploy
logs: `42501` / `violates row-level security policy for table "documents"`.
