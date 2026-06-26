---
name: Instant-Attorney ad-hoc scripts
description: How to run one-off DB/AI scripts against this npm-isolated Next app
---

# Running ad-hoc scripts in artifacts/instant-attorney

- **Location matters:** place the script INSIDE `artifacts/instant-attorney/` (node ESM
  resolves `node_modules` from the script's own directory, not cwd). A script in `/tmp`
  fails with ERR_MODULE_NOT_FOUND for `@supabase/supabase-js` etc.
- **Env:** `SUPABASE_SERVICE_ROLE_KEY` is ONLY in `.env.local` (not exported to the shell);
  `NEXT_PUBLIC_SUPABASE_URL` and `Claude_Instant_Attorney` ARE in the shell. Parse
  `.env.local` manually in the script. Never print secret values.
- **`@/` alias:** route files and `lib/usage-tracker.ts` import `@/lib/...` which tsx can't
  resolve outside Next. Import only relative-safe modules (`lib/prompts`, `lib/document-utils`,
  `lib/file-parser`, `lib/doc-generator`, `lib/token-limits`, `lib/types`); skip per-event
  usage recording in scripts.
- **tsx = CJS:** `.ts` run via `npx --yes tsx` compiles to CJS → **no top-level await**.
  Wrap in `async function main(){...}; main().catch(...)`, or use a `.mjs` file (native ESM,
  TLA allowed) for plain JS.
- **Long AI runs (>120s):** bash and background jobs get killed (~120s SIGKILL). Run the
  script as a managed console workflow (`configureWorkflow` outputType console autoStart),
  have it write progress + a final result JSON sentinel, poll the sentinel from bash, then
  `removeWorkflow`.
