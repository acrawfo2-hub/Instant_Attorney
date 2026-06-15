---
name: Attorney AI critical-review is manual-only
description: Why the attorney intake must NOT auto-run AI review on submission.
---

The attorney dashboard does NOT auto-run an AI critical review when a client
submits a draft. AI review is on-demand only: the attorney opens a draft's review
page and clicks "Run Critical Review" (`runManualReview` →
`POST /api/attorney/documents/[id]/review`).

**Why:** the user (attorney) explicitly does not want an AI review gating their
view — they want to see the raw drafts as a plain list, then choose to send one
for AI review, then write the attorney draft themselves. The old auto-trigger also
left docs stuck at `review_status="reviewing"` (the "AI reviewing…" badge that
never cleared) and made the dashboard feel frozen.

**How to apply:** do not re-add any auto/background review to
`finalizeDocumentSubmission`. Keep `upsertCriticalReviewChild` (used by the manual
route). The `auto_document_review` profile column and `/api/attorney/settings`
route are now dead code — safe to ignore; don't reintroduce a toggle that turns
auto-review back on.
