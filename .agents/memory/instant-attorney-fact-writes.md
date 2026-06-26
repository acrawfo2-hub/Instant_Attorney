---
name: Instant-Attorney fact_items writes
description: Persistence + ownership rules when writing client facts (fact_items) in the legal-intake app
---

# Writing client facts (fact_items)

## Persist wizard answers independently of draft generation
Wizard checklist answers are key case facts and must be saved the moment the client
submits — NOT only as a side effect of draft generation.

**Why:** the document wizard used to send answers only to the AI drafter. When
generation 502'd/timed out (or the tab closed), everything the client typed was lost.
A real client (intake captured 18 facts, but 0 from the document wizard) hit this.

**How to apply:** the client awaits a fast `POST /api/wizard/save-answers` BEFORE the
slow drafter, and blocks (with a retry message) if that save fails — never generate
first and risk losing answers.

## fact_items has no label/source column
Columns are only: id, case_file_id, user_id, description, status, created_at, updated_at.
Facts are stored as `"<label>: <value>"` strings (both AI- and wizard-written). Dedupe
by description prefix (`"<label>:"`), updating in place so re-answering a field doesn't
pile up duplicates. A wizard label can overwrite an AI fact with the same prefix —
acceptable (latest client answer wins).

## RLS does NOT enforce case ownership — check it at the app layer
`fact_items` RLS only checks `auth.uid() = user_id`. It does NOT constrain
`case_file_id`. So an authed user could attach their own facts to another user's case
by passing a foreign `caseFileId`.

**How to apply:** any endpoint that writes facts by a caller-supplied `caseFileId` must
first verify ownership — `case_files` where `id = caseFileId AND user_id = auth user`
(RLS-scoped select returns nothing if not owned) — and 403 otherwise. The older
`/api/wizard` route has this same gap; new fact-writing routes should not.
