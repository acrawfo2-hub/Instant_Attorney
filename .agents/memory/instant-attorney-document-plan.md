---
name: Instant-Attorney multi-document file plan & lead tracking
description: How a file tracks several documents — one "lead" drives the 5-step spine while a roadmap shows the rest; attorney can override the lead
---

# A file is multiple documents; the spine tracks ONE "lead"

A case file usually needs several documents. The source of truth is
`legal_strategy.document_plan: PlanEntry[]` — an ordered list (index 0 = lead).
Each `PlanEntry` has `{ key, title, engine, rationale }` where:

- **key** = stable slug identity (derived from the title). This — NOT the engine
  — is what identifies a document, so several custom documents that all use the
  `general_document` engine stay distinct.
- **engine** = a `WizardType`, but it ONLY selects interview hints / formatting.
  Open-ended document types map to `general_document`; we never enumerate them.

The next-step engine (`lib/next-step.ts`) drives ONE document (the lead) to
approval via the 5-step spine, then advances to the next-priority incomplete one.

- `buildDocumentPlan(caseFile, documents)` → ranked `PlanItem[]`; each item is
  matched to its document by **`content_json.plan_key === entry.key`** (legacy
  fallback: by `doc_type` for typed engines / `recommended_wizards`).
- `effectiveLeadKey(caseFile)` = `lead_key_override ?? document_plan[0].key`.
- `computeNextStep` scopes the spine to the active document (lead until approved,
  else first non-approved) — never `.some()` across all docs.
- Client: "Document X of N" pill + collapsed roadmap (`NextStepGuide.tsx`) when N>1.

# Documents are stamped with their plan_key

Wizard links carry `planKey` (+ `instrument` title + `engine` path). `/api/wizard`
stamps `content_json.plan_key` on create and reuses by it (`findReusableDocument`
matches `content_json->>plan_key` when a planKey is given, else `doc_type`).
`recommended_wizards` is now DERIVED (unique engines) for back-compat only.

# Attorney can override the lead

`POST /api/attorney/case-files/[id]/document-plan`:
- plan-based files send `{ leadKey: string | null }` → sets `lead_key_override`.
- legacy files (no `document_plan`) send `{ lead: WizardType | null }` → `lead_override`.
Surfaced on the attorney per-client view via `DocumentPlanEditor` (it picks the
field based on whether a `document_plan` exists).

**Gotcha:** `parseLegalStrategy` (`lib/file-parser.ts`) overwrites `legal_strategy`
wholesale on every strategy re-parse. It now (a) reuses prior plan KEYS by matching
normalized title so client progress survives, (b) keeps an existing plan if a later
block omits it, and (c) carries forward `lead_key_override`/`lead_override`.
Preserve all three when touching that function.

# Known follow-up
`ClientFileView.tsx` still renders the "Suggested Instruments" / wizard grid off
the legacy engine list and does NOT pass `planKey`. Documents started from those
buttons won't be plan-keyed. Migrate that surface to `document_plan` next.

# Never ask the same thing twice (cross-document fact reuse)

`buildFileContext` already injects ALL confirmed facts into every document's
drafting context, so the AI has document 1's facts when drafting document 3.
The deterministic backstop lives in `buildNeededItems(parsed, confirmedFacts)`
(`lib/wizard-parsing.ts`): it drops any checklist item already answered by a
confirmed fact. Facts are stored by `save-answers` as `"<label>: <value>"`;
matching compares the FULL normalized label so identity-bearing fields stay
distinct (e.g. "Party A" answered does NOT suppress "Party B"). The `/api/wizard`
route returns `knownFacts` so the client can apply this filter.
