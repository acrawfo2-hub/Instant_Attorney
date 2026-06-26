---
name: Full-module mocks must list every imported export
description: Why adding an import to an instant-attorney route can break a passing-typecheck test at ESM link time.
---

# Full-module mocks must list every export the route imports

instant-attorney's unit tests run with Node `--experimental-test-module-mocks` and
`mock.module(libUrl("X.ts"), { namedExports: {...} })`. These mocks **replace the
module's entire export surface** — any export the code-under-test imports but the
mock omits causes a runtime ESM link error: "does not provide an export named '…'".

**Why:** `tsc --noEmit` passes because the real module genuinely exports the symbol,
so the breakage is invisible to typecheck and only shows up in `npm test`. Adding a
new import to a route (e.g. a route importing `stampFactsSynced` from
`@/lib/document-utils`) silently breaks any test that mocks that module.

**How to apply:** when you add/repoint an import in an instant-attorney route or lib
that a `*.test.ts` mocks via `mock.module`, update that mock's `namedExports` to
include the new symbol (a no-op `async () => {}` is fine when the test doesn't assert
on it). Run `npm test` from the artifact dir, not just typecheck — CI's `test` job
runs both and fails the push on either.
