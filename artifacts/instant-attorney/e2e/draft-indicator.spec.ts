import { test, expect } from "@playwright/test";
import { hasSupabaseAdmin } from "./helpers/env";
import {
  cleanupProvisionedClient,
  provisionClientWithDraft,
  type ProvisionedClient,
} from "./helpers/supabase-fixtures";

/**
 * P0: Draft-in-progress indicator on CaseDocumentsTable.
 *
 * Mocks /api/chat-acp/status to return running:true for the first two polls,
 * then running:false, done:true on the third. Confirms the banner appears while
 * running and disappears once the job completes, and that the drafts list is
 * refreshed afterwards.
 *
 * No AI is invoked — the status endpoint is intercepted by Playwright.
 */
test.describe("draft-in-progress indicator", () => {
  test.skip(
    !hasSupabaseAdmin(),
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );

  let client: ProvisionedClient;

  test.beforeAll(async () => {
    client = await provisionClientWithDraft();
  });

  test.afterAll(async () => {
    if (client) await cleanupProvisionedClient(client);
  });

  test("banner appears while running and disappears when job finishes", async ({
    page,
  }) => {
    // Track how many times the status endpoint has been called so we can
    // switch from running→done after a couple of polls.
    let statusCallCount = 0;
    // Track whether the drafts list was re-fetched after the job finished.
    let draftsRefreshedAfterDone = false;
    let jobDoneSeenAt = -1;

    await page.route("**/api/chat-acp/status**", async (route) => {
      statusCallCount++;
      const callIndex = statusCallCount;

      // First two calls → running; third and beyond → done.
      const running = callIndex <= 2;
      if (!running && jobDoneSeenAt === -1) {
        jobDoneSeenAt = callIndex;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          running
            ? { running: true, done: false, jobId: "mock-job-1", caseFileId: client.caseFileId }
            : { running: false, done: true, jobId: "mock-job-1", caseFileId: client.caseFileId }
        ),
      });
    });

    // Intercept workspace/drafts to detect the post-completion refresh.
    await page.route("**/api/workspace/drafts**", async (route) => {
      // If we've seen at least one done response, this is the post-completion refresh.
      if (jobDoneSeenAt !== -1) {
        draftsRefreshedAfterDone = true;
      }
      await route.continue();
    });

    // Log in via cookie and navigate straight to the case file page.
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    // ── Banner should appear ──────────────────────────────────────────────────
    // The first status poll fires on mount; banner should be visible promptly.
    const banner = page.locator('[role="status"].cdt-draft-progress');
    await expect(banner).toBeVisible({ timeout: 10_000 });
    await expect(banner).toContainText("A draft is being written");

    // ── Banner should disappear after the job finishes ────────────────────────
    // The component polls every 5 s; advance clock by enough to trigger 2 more
    // polls so we reach the "done" branch. We wait up to 20 s real time since
    // Playwright uses real timers for page.waitForSelector.
    await expect(banner).toBeHidden({ timeout: 20_000 });

    // ── Drafts list should have been refreshed ────────────────────────────────
    expect(draftsRefreshedAfterDone).toBe(true);
  });

  test("banner is not shown when no job is running", async ({ page }) => {
    // Status endpoint always returns not-running, not-done.
    await page.route("**/api/chat-acp/status**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ running: false, done: false }),
      });
    });

    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    // Wait for the page content to settle (docs table renders).
    await page.waitForLoadState("networkidle");

    const banner = page.locator('[role="status"].cdt-draft-progress');
    await expect(banner).toBeHidden();
  });
});
