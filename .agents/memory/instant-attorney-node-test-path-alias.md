---
name: Instant-Attorney node:test path-alias limitation
description: Why some lib tests fail to load and how to write loadable tests in this artifact
---

The instant-attorney test runner is plain `node --test 'lib/**/*.test.ts'` (no
bundler, no ts-path resolution). It can only load modules whose import graph uses
**relative** specifiers (`./foo.ts`).

**Rule:** A `lib/*.test.ts` file — and every lib module it transitively imports —
must import via relative paths, not the `@/lib/*` TS path alias. A test that
imports a module which itself does `import ... from "@/lib/..."` fails at load with
`ERR_MODULE_NOT_FOUND: Cannot find package '@/lib'`.

**Why:** node's ESM loader has no knowledge of tsconfig `paths`; `@/lib` resolves
as a real package name and isn't found.

**How to apply:** When adding tests, import the unit under test relatively. If the
unit currently uses `@/lib` imports, it can't be unit-tested as-is — either it's
only reachable via Next (route/page code, where `@/` works) or the lib module
needs its imports switched to relative. `lib/mission-control.test.ts` is a known
pre-existing failure for exactly this reason (mission-control.ts imports `@/lib`);
it is unrelated to any new test work.
