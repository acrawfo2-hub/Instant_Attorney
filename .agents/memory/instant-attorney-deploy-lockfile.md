---
name: Instant-Attorney deploy installs from the committed lockfile
description: Why adding a dep to package.json without running npm install breaks the publish build, and why the next pin must track the lockfile.
---

# The publish build uses the committed package-lock.json, not package.json

instant-attorney is npm-isolated (excluded from the pnpm workspace), so the publish
build resolves its deps from the **committed `artifacts/instant-attorney/package-lock.json`**
— the deployed `next` version matches the lockfile, not the `package.json` range.

**Failure mode:** adding a dependency to `package.json` (e.g. a task agent added
`@huggingface/transformers` for the voice feature) without running `npm install`
leaves the **lockfile and node_modules stale**. Dev still "runs" because Next
compiles routes lazily, so the unhit import never errors — but `next build` at
publish time fails hard with `Module not found: Can't resolve '<pkg>'`, and the
publish fails. Always run `npm install` in the artifact dir after any `package.json`
dependency change so the lockfile is regenerated, then commit the lockfile.

**`next` pin must track the lockfile.** `package.json` had drifted to pin
`next@15.3.2` while the lockfile + node_modules had already moved to `15.5.19`.
`15.3.2` is **firewall-blocked (Critical CVE)** — a bare `npm install` tried to
downgrade node_modules to satisfy the stale pin and got a 403 from
`package-firewall.replit.local`. Fix: set the `package.json` pin (and
`eslint-config-next`) to the version the lockfile already uses, then install.

**Why:** the publish container installs from the lockfile, so the lockfile is the
source of truth for what actually ships; package.json drift either ships the wrong
thing or blocks the install entirely.
