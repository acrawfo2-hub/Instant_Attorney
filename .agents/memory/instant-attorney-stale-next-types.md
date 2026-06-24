---
name: Stale .next/types cause false typecheck failures
description: Why `npm run typecheck` can fail on a route that no longer exists, and how to clear it.
---

# Stale `.next/types` cause false typecheck failures

instant-attorney's `npm run typecheck` is `tsc -p tsconfig.json --noEmit`, and the
tsconfig `include` pulls in Next's generated `.next/types/**` (validator.ts,
routes.d.ts). Next writes these incrementally during `next dev`, and it does **not**
always prune entries for routes you delete or rename.

**Symptom:** typecheck fails with e.g. `.next/types/validator.ts: Cannot find module
'../../app/api/<deleted-route>/route.js'`, even though the route is genuinely gone
and the real source is fine. The same staleness also means newly-added routes are
missing from `.next/types/routes.d.ts` until regenerated.

**Why:** the failure is in generated build artifacts, not your code. A fresh CI
checkout has no `.next`, so CI typecheck doesn't hit it; it's a local-only artifact
of a long-running dev server that saw the old route shape.

**How to apply:** when typecheck points at a `.next/types/...` path for a route you
changed/removed, `rm -rf artifacts/instant-attorney/.next` then restart the web
workflow (or hit a page) to regenerate, and re-run typecheck. Don't "fix" code that
isn't broken.
