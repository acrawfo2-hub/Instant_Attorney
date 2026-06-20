---
name: Dependency vulnerability fixes
description: How to patch transitive dependency vulns across the pnpm workspace and the npm-isolated instant-attorney app
---
The repo has two package managers: the pnpm workspace (all artifacts except instant-attorney + libs) and instant-attorney's own npm (`package-lock.json`). `pnpm audit` and `npm audit` (run inside artifacts/instant-attorney) are SEPARATE — both must be clean.

**Rule:** patch transitive vulns with version-floor overrides, not by editing every consumer.
**Why:** vite/esbuild/@babel/core/qs/js-yaml/markdown-it are pulled in transitively (express→qs, orval→js-yaml + typedoc→markdown-it, @vitejs/plugin-react→@babel/core).
**How to apply:**
- pnpm workspace: add floors to `overrides:` in `pnpm-workspace.yaml` (e.g. `qs: ">=6.15.2"`). vite is a `catalog:` entry, bump its pin there. esbuild has an explicit pinned override (bump the pin, not a range).
- instant-attorney (npm): next pins an EXACT vulnerable `postcss` (e.g. 8.4.31). npm nested overrides (`"next": {"postcss": ...}`) silently FAIL to apply to exact-pinned nested deps. Since postcss is also a direct devDep, the working pattern is: bump the direct devDep floor AND set `"overrides": { "postcss": "$postcss" }`. Then delete `node_modules/next` + `.package-lock.json` and run a full `npm install` (NOT `--package-lock-only`, which won't re-resolve overrides).
- pnpm leaves old versions in `node_modules/.pnpm/` after upgrade; that's store leftover. Trust `pnpm audit` (reads lockfile), confirm with `grep -c "  pkg@oldver:" pnpm-lock.yaml` == 0.
