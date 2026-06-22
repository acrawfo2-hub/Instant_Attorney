---
name: Instant-Attorney HOA dispute modules
description: How HOA/property-owners'-association support is layered onto the existing pipeline without new DocType/DB enums.
---

# HOA support is additive — no new DocType / DB enum

HOA disputes were added as a vertical WITHOUT touching the `documents.doc_type`
enum or the DB (the live Supabase project lags on migrations and we have no DDL
access — see instant-attorney-supabase-migrations.md). The design instead layers
data + prompt grounding on top of the existing wizard types:

- **`lib/hoa-statutes.ts`** — curated, source-cited Texas HOA statute registry
  (Tex. Prop. Code Ch. 209 & 202), mirroring `lib/government-forms.ts`. Every
  entry cites statutes.capitol.texas.gov. `hoaStatutesForPrompt()` is injected
  into `ACP_CHAT_SYSTEM_PROMPT` so intake grounds on real citations.
- **`lib/hoa-instruments.ts`** — HOA instrument PRESETS (violation response,
  records request, fine appeal, accommodation request, ACC appeal, payment plan,
  selective-enforcement demand, lien/foreclosure response). Each preset declares a
  `wizard_type` that is an EXISTING `WizardType` (mostly `general_document`, one
  `demand_letter`) — so they reuse the published draft/review pipeline. A test
  asserts every `relevant_statutes` key resolves and every `wizard_type` is real.
- **`lib/practice-areas.ts`** — slug→opener map. The landing tiles always linked
  to `/free-chat?area=<slug>` but free-chat never read the param (latent no-op);
  it now swaps the greeting in a mount `useEffect` (after-mount so no hydration
  mismatch). Covers all existing tiles, not just `hoa`.
- **HUD-903** added to the government-forms registry for FHA accommodation/
  discrimination complaints (covered by the existing gov-forms test).
- Prompt edits: `prompts.ts` (scope + HOA block + **attorney-fee/prevailing-party
  risk**, which is the #1 thing that changes whether a homeowner should fight) and
  `attachment-processor.ts` (extract enforcement/fine/hearing/ACC/lien/fee clauses
  when a governing doc is uploaded).

**Why presets over new wizard types:** new `DocType` enum values would ripple into
the DB doc_type constraint, the wizard picker, and `buildFallbackTemplate` — and
the live DB can't take DDL from tooling. Presets give HOA-shaped output today with
zero schema risk.

**Testability:** all four data modules are pure and have co-located `*.test.ts`
(`node --test`), so CI (`.github/workflows/ci.yml`: typecheck + `npm test` on every
push/PR) covers them. The React/Anthropic-importing edits are trivial and verified
in CI where node_modules is installed; they can't be typechecked offline (no
registry access in the sandbox).
