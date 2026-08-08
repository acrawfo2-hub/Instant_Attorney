---
name: recommended_wizards must be clean wizard tokens
description: legal_strategy.recommended_wizards entries must be bare wizard-type keys; some render paths use exact-match validation, not coerceWizardType, so junk suffixes silently break UI/handoff.
---

# legal_strategy.recommended_wizards must be clean wizard-type tokens

> **⚠️ Field is deprecated but still live.** `recommended_wizards` is superseded
> by `document_plan` and both are retired in Phase 3 of
> `docs/orchestrator-migration-plan.md`. Until then this rule still holds, and
> read paths must keep tolerating historical rows. See
> `instant-attorney-orchestrator-migration.md`.

`case_files.legal_strategy.recommended_wizards` is consumed by multiple paths with
**inconsistent** validation, so a malformed entry like
`"draft_contract — ready to proceed"` or a non-wizard token like
`"RECOMMEND_CONSULT: true"` breaks things silently:

- Mission Control (`lib/mission-control.ts`) is forgiving — it runs each value through
  `coerceWizardType` (strips suffix to the leading wizard token), so hero/links still resolve.
- BUT `components/ClientFileView.tsx` renders the "Recommended Documents" wizard cards via
  `recommendedWizards.filter(isValidWizardType)` — **exact** `type in WIZARD_LABELS` match.
  A suffixed value fails the filter → **zero wizard cards render** even though the doc is recommended.
- `app/chat/page.tsx` wizard handoff uses `Object.hasOwn(WIZARD_LABELS, w)` — also exact match → handoff breaks.
- `buildFileContext` renders the raw strings, leaking the junk into context.

**Why:** the AI intake sometimes emits decorated/extra tokens (consult flags belong in the
separate `recommend_consult` boolean field, not in `recommended_wizards`).

**How to apply:** keep `recommended_wizards` as an array of bare valid wizard keys
(`demand_letter`, `complaint_letter`, `draft_contract`, `draft_waiver`, `wills_trusts`,
`doc_review`, `general_document`). To repair a row deterministically (no AI rerun), read the
JSONB `legal_strategy`, map each entry through the same coerce logic
(`raw.trim().split(/[^a-zA-Z_]/)[0].toLowerCase()`, keep if a valid key), dedupe, write back
preserving every other field (`recommend_consult` etc.). Better long-term fix: have the render
paths use `coerceWizardType` consistently instead of exact-match, or sanitize on write.
