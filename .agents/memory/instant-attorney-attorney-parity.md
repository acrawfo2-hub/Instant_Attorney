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
