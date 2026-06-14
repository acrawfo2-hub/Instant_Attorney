---
name: Instant-Attorney multi-document file plan & lead tracking
description: How a file tracks several documents — one "lead" drives the 5-step spine while a roadmap shows the rest; attorney can override the lead
---

# A file is multiple documents; the spine tracks ONE "lead"

A case file usually needs several documents. The attorney strategy's
`legal_strategy.recommended_wizards` is the **ranked** list (index 0 = AI's lead
pick). The next-step engine (`lib/next-step.ts`) drives ONE document — the lead —
all the way to attorney approval via the 5-step spine, then advances to the
next-priority incomplete document.

- `buildDocumentPlan(caseFile, documents)` → ranked `PlanItem[]` with per-item
  status (matched to a top-level document by `doc_type`). Lead is priority 1.
- `effectiveLeadWizard(caseFile)` = `legal_strategy.lead_override ?? recommended_wizards[0]`.
- `computeNextStep` scopes the spine to the **active document** (lead until
  approved, else first non-approved) — NOT `.some()` across all docs, which used
  to mix unrelated documents into one spine.
- The client shows a "Document X of N" pill + a collapsed roadmap
  (`NextStepGuide.tsx`) only when N>1. Single-document files look unchanged.

# Attorney can override the lead

`POST /api/attorney/case-files/[id]/document-plan` with `{ lead: WizardType | null }`
sets `legal_strategy.lead_override` (null reverts to the AI pick). Surfaced on the
attorney per-client view via `DocumentPlanEditor`.

**Gotcha:** `parseLegalStrategy` (`lib/file-parser.ts`) overwrites `legal_strategy`
wholesale on every strategy re-parse. It now READS the prior `lead_override` and
carries it forward — otherwise a later chat turn silently wipes the attorney's
choice. Preserve this when touching that function.

# Never ask the same thing twice (cross-document fact reuse)

`buildFileContext` already injects ALL confirmed facts into every document's
drafting context, so the AI has document 1's facts when drafting document 3.
The deterministic backstop lives in `buildNeededItems(parsed, confirmedFacts)`
(`lib/wizard-parsing.ts`): it drops any checklist item already answered by a
confirmed fact. Facts are stored by `save-answers` as `"<label>: <value>"`;
matching compares the FULL normalized label so identity-bearing fields stay
distinct (e.g. "Party A" answered does NOT suppress "Party B"). The `/api/wizard`
route returns `knownFacts` so the client can apply this filter.
