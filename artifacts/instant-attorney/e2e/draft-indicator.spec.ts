import { test, expect } from "@playwright/test";
import { hasSupabaseAdmin } from "./helpers/env";
import {
  cleanupProvisionedClient,
  provisionClientWithDraft,
  type ProvisionedClient,
} from "./helpers/supabase-fixtures";

/**
 * P0: Durable per-document generation status on CaseDocumentsTable.
 *
 * Mocks the case-keyed durable status endpoint with three siblings: one becomes
 * ready early, one completes later, and one fails. Confirms every document has
 * its own card and that ready transitions refresh the drafts independently.
 *
 * No AI is invoked — the status endpoint is intercepted by Playwright.
 */
test.describe("per-document draft status", () => {
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

  test("three siblings update independently and a failed sibling stays visible", async ({
    page,
  }) => {
    // Track how many times the status endpoint has been called so we can
    // switch from running→done after a couple of polls.
    let statusCallCount = 0;
    // Track whether the drafts list was re-fetched after the job finished.
    let draftsRefreshedAfterDone = false;
    let jobDoneSeenAt = -1;

    await page.route("**/api/workspace/drafts/status**", async (route) => {
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
          { caseFileId: client.caseFileId, jobs: [
            { id: "a", title: "Demand letter", state: callIndex === 1 ? "drafting" : "ready", label: callIndex === 1 ? "Drafting with known facts" : "Working draft ready", active: callIndex === 1, missing_fact_labels: [], latest_revision: callIndex === 1 ? 0 : 1 },
            { id: "b", title: "Affidavit", state: running ? "checking" : "ready", label: running ? "Checking consistency" : "Working draft ready", active: running, missing_fact_labels: [], latest_revision: running ? 1 : 2 },
            { id: "c", title: "Exhibit list", state: "failed", label: "Drafting failed", active: false, missing_fact_labels: ["Hearing date"], latest_revision: 0, failure_message: "Source file could not be read" },
          ] }
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
    const cards = page.locator('[role="status"].cdt-draft-progress');
    await expect(cards).toHaveCount(3, { timeout: 10_000 });
    await expect(cards.filter({ hasText: "Demand letter" })).toContainText("Drafting with known facts");
    await expect(cards.filter({ hasText: "Exhibit list" })).toContainText("Source file could not be read");

    // ── Banner should disappear after the job finishes ────────────────────────
    // The component polls every 5 s; advance clock by enough to trigger 2 more
    // polls so we reach the "done" branch. We wait up to 20 s real time since
    // Playwright uses real timers for page.waitForSelector.
    await expect(cards.filter({ hasText: "Affidavit" })).toContainText("Working draft ready", { timeout: 20_000 });

    // ── Drafts list should have been refreshed ────────────────────────────────
    expect(draftsRefreshedAfterDone).toBe(true);
  });

  test("status cards are not shown when the case has no jobs", async ({ page }) => {
    await page.route("**/api/workspace/drafts/status**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ caseFileId: client.caseFileId, jobs: [] }),
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
