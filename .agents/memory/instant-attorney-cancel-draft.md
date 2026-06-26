---
name: Cancel/delete unwanted draft documents
description: How the client-facing "Cancel this document" delete works and its two coupling constraints.
---

# Cancel/delete unwanted draft documents

Clients can delete a draft (or doc-review) they started but don't want, via a two-step
confirm button (`CancelDocButton`) shown in `ClientFileView` only for documents in
status `draft` or `changes_requested`. Backed by a `DELETE` handler on
`/api/documents/[id]`.

## Rule 1: client-cancel deletes are OWNER-ONLY
The DELETE handler forbids anyone but the document owner — attorneys deliberately do
**not** get a destructive delete here.
**Why:** the GET handler's access check allows owner OR attorney; copying that pattern
into DELETE let any attorney delete a client's draft, which contradicts the
"client discards their own unwanted draft" intent.
**How to apply:** for client-initiated destructive actions, gate on `doc.user_id === userId`
only; do not carry over the `|| isAttorney` bypass used for read access.

## Rule 2: deleting a draft must also remove its placeholder-derived gap facts
The draft seeds `fact_items` (status `gap`) from its `[[blanks]]`. On delete, also
delete those gap rows whose label is no longer referenced by any other document on the
same case.
**Why:** the Open-Fact-Gaps view hides gaps that match a current doc's placeholders; if
the doc is deleted without cleanup, its gaps stop matching anything and resurface as
real open gaps.
**How to apply:** compute removed doc + children placeholder labels, subtract labels still
used by other case docs, delete matching `gap` fact_items. Heuristic text match on
description (lowercased) — small collision risk if a real gap's description equals a
placeholder label.

Mutations use the service client after ownership is verified (RLS would otherwise block
child-doc / fact cleanup). Deletes are not transactional — acceptable given low blast radius.
