import { defineConfig, devices } from "@playwright/test";
import { getBaseUrl } from "./e2e/helpers/env";

/**
 * Playwright config for Instant Attorney P0 e2e tests.
 *
 * Run against staging:
 *   PLAYWRIGHT_BASE_URL=https://staging.example.com \
 *   E2E_EMAIL=... E2E_PASSWORD=... \
 *   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   npm run test:playwright
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  timeout: 60_000,
  use: {
    baseURL: getBaseUrl(),
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
