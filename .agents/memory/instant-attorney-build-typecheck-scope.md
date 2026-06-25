---
name: next build typechecks the whole project — e2e/playwright breaks publish
description: Why adding Playwright/e2e files to instant-attorney fails the production publish even when local dev is fine.
---

# `next build` typechecks every .ts — exclude the e2e/playwright toolchain

instant-attorney's production publish runs `next build`, whose "Checking validity
of types" step typechecks **every** file matched by `tsconfig.json` `include`
(`**/*.ts`, `**/*.tsx`). That includes `playwright.config.ts` and `e2e/*.spec.ts`.

**Symptom:** publish fails at the type step with `Cannot find module
'@playwright/test'` (or any e2e-only devDep). It builds fine the day before, then a
merge that adds an e2e suite breaks the next publish. Local `npm run typecheck` uses
the same tsconfig, so it fails too — but you may not have re-run it after the merge.

**Why:** `@playwright/test` is an e2e-only dependency that isn't resolvable during the
production build, and the Playwright config/specs are a separate test toolchain that
should never be part of the app's production type validation.

**How to apply:** keep the e2e toolchain out of the Next typecheck — add
`"**/*.spec.ts"`, `"e2e"`, and `"playwright.config.ts"` to `tsconfig.json` `exclude`
(`**/*.test.ts` was already excluded for the node:test unit suite). Playwright runs
specs through its own runner (`npm run test:playwright`), so excluding them from tsc
does not reduce coverage. General rule: any new test/tooling file that imports a
dev-only package must be excluded from the build tsconfig, or it sinks the publish.
