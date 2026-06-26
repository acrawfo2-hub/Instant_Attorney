---
name: Instant-Attorney client/server bundle boundary
description: What pure helpers a "use client" component may import without dragging server-only code (Anthropic SDK) into the browser bundle
---

# Keep server-only code out of client components

`lib/document-utils.ts` instantiates `new Anthropic(...)` at module load (reads
`process.env.Claude_Instant_Attorney`). Importing ANY symbol from it into a
`"use client"` component pulls the Anthropic SDK + the key reference into the
browser bundle — even pure helpers like `pickFirstValidWizard` / `isValidWizardType`.

**Why:** these helpers live next to server-only code, so the whole module is dragged in.

**How to apply:** from client components, import only pure constants/types from
`lib/types.ts` (e.g. `WIZARD_LABELS`, `docTypeLabel`, `LegalStrategy`) and inline
small checks (`Object.hasOwn(WIZARD_LABELS, w)`) instead of importing from
`document-utils`. For client-side reads of the user's own rows, use the browser
client `createClient()` from `lib/supabase/client.ts` (RLS allows owner reads).
