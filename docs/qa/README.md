# Instant Attorney — QA Resources

| Resource | File | Purpose |
|----------|------|---------|
| **Test checklist** | [qa-test-checklist.csv](./qa-test-checklist.csv) | Spreadsheet-ready QA matrix — import into Google Sheets or Excel |
| **Staging setup** | [staging-test-account-setup.md](./staging-test-account-setup.md) | How to provision test accounts and env for manual + automated QA |
| **Playwright tests** | `artifacts/instant-attorney/e2e/` | Browser + API P0 tests for auth redirects, login, and document submit |

## Quick start

```bash
cd artifacts/instant-attorney

# 1. Copy env and follow staging-test-account-setup.md
cp ../../.env.local.example .env.local

# 2. Unit tests (Node 24)
npm test

# 3. Smoke (deployed app, no browser)
BASE_URL=https://your-staging.example.com \
  E2E_EMAIL=... E2E_PASSWORD=... \
  node scripts/e2e.mjs

# 4. Playwright P0 tests
npm run test:playwright
```

Playwright reads `PLAYWRIGHT_BASE_URL` (or `BASE_URL`). Auth login and submit tests also need Supabase service-role credentials; see the staging guide.
