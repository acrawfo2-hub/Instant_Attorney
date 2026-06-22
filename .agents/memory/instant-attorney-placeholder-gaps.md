---
name: Placeholder gaps vs real fact gaps
description: Why/how document [[placeholder]] labels are separated from Open Fact Gaps in the case file view.
---

# Document placeholders pollute Open Fact Gaps

`syncDraftGapsToLivingFile` (lib/file-parser.ts) inserts every unfilled
`[[placeholder]]` label from a draft as a generic `fact_item` with `status:"gap"`
and **no link to the source document**. So document blanks (e.g. "Date Of
Memorandum", "Reviewing Attorney Name", "Pending") leak into the client-facing
Open Fact Gaps list as if they were intake gaps.

**Decision:** separate them in the **view layer**, not the schema. In
ClientFileView, recompute each document's current placeholder labels via
`placeholderFields(draft_text)` (client-safe pure fn from lib/wizard-parsing),
build a lowercased label set, and partition `gaps`:
- gap description matches a current placeholder label → "Document Placeholders"
  section, grouped by source document (keyed by `doc.id`).
- otherwise → stays in Open Fact Gaps.

**Why:** Supabase migrations fail silently here (no metadata column for gap
origin is available), and matching against live `draft_text` self-corrects as
blanks get filled — a filled placeholder drops out of both lists automatically.

**How to apply:** the match is by label text only, so a real intake gap whose
description coincidentally equals a placeholder label (e.g. "Address") would be
moved. Accepted tradeoff given no origin metadata. If origin tracking is ever
added to `fact_items`, prefer it over text matching.
