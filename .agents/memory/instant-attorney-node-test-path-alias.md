---
name: Instant-Attorney node:test path-alias limitation
description: Why some lib tests fail to load and how to write loadable tests in this artifact
---

The instant-attorney `test` script now registers an ESM resolve hook
(`lib/test-support/register.mjs` → `alias-loader.mjs`) plus
`--experimental-test-module-mocks`, so `@/lib/*` alias imports DO load under
`node --test`. This is what un-broke `lib/mission-control.test.ts` (it no longer
fails on `@/lib`) and lets route handlers (e.g. `app/api/wizard/route.ts`) be
imported and tested directly.

**How to test a Next route handler here:**
- Import the route via `import(pathToFileURL(<root>/app/api/.../route.ts).href)`.
- Mock externals/IO with `mock.module(...)` BEFORE the dynamic import: bare pkgs
  by specifier (`@anthropic-ai/sdk` via `defaultExport`); `@/lib/*` mocks keyed by
  `pathToFileURL(<root>/lib/x.ts).href` (NOT the `@/` string — the route and test
  must resolve to the same URL for the mock to apply).
- `next/server` does NOT resolve under plain Node (Next bundler export
  conditions). The loader maps it to `lib/test-support/next-server-stub.mjs`
  (NextResponse.json / NextRequest). Do not try to `mock.module("next/server")` —
  mock.module can't resolve it.
- Set `process.env.BYPASS_AUTH="true"` before importing the route to skip
  auth/subscription/ownership and focus on the handler's own wiring.
- Supabase query builders are thenable: a mock builder needs `.then` (awaited list
  reads + the status-preserving UPDATE await the builder directly) AND
  `.single`/`.maybeSingle`.

**Why the hook (not relative imports):** node's ESM loader has no tsconfig
`paths`; the resolve hook rewrites `@/x` → `<cwd>/x` with extension probing.
