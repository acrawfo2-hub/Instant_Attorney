---
name: Inline blank-fill placement
description: DocumentInfoNeeded must be rendered in BOTH the reviewDocs AND otherDocs loops in CaseDocumentsTable — it only appeared in otherDocs originally, so documents in "pending_review" status silently showed no inline inputs.
---

CaseDocumentsTable splits documents into two arrays (line ~261):
- `reviewDocs` = `pending_review` → rendered under "With your attorney"
- `otherDocs` = everything else → rendered under "Drafts & documents"

`DocumentInfoNeeded` was originally only in the `otherDocs.map()` loop. Any document submitted for review (`pending_review`) landed in `reviewDocs` and got no inline fill-in UI, even when its draft_text still had [[placeholders]].

**Fix:** Add `DocumentInfoNeeded` (and the `fillTarget`/`blanks` setup lines) inside `reviewDocs.map()` too, with the same condition: `!isAttorney && fillTarget?.draft_text`.

**Why:** Clients often submit a draft before all blanks are filled. The attorney review window is exactly when they should be completing those blanks — hiding the UI at that moment is the worst possible timing.

**How to apply:** Any new document grouping added to CaseDocumentsTable (e.g. approved, delivered) must also evaluate whether `DocumentInfoNeeded` belongs there, rather than assuming only draft-status docs need it.
