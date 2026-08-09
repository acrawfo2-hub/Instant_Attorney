import { test, expect } from "@playwright/test";
import { hasSupabaseAdmin } from "./helpers/env";
import {
  cleanupProvisionedClient,
  provisionClientWithDraft,
  type ProvisionedClient,
} from "./helpers/supabase-fixtures";

/**
 * Confirms that both persistent "continue chat" entry points in the client
 * case file resolve to the correct conversation for that specific file.
 *
 * The two entry points added by task #60:
 *   1. The gold "Continue in chat →" pill in the SectionJumpBar
 *   2. The sticky "Continue legal chat" button in AskAssistantBar
 *
 * A wrong or absent caseFileId would silently drop the client into a blank
 * or wrong conversation.  These tests pin that the assembled href is correct
 * and that following it does not produce a 4xx/5xx.
 *
 * No AI is invoked; this only checks link targets and HTTP status.
 */
test.describe("chat shortcuts on the client case file", () => {
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

  test("jump-bar chat pill href contains the correct caseFileId", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    // The pill is rendered by SectionJumpBar and carries the class
    // lf-section-nav-pill-chat.  Wait for it to be present; the bar only
    // appears after the page has hydrated.
    const pill = page.locator("a.lf-section-nav-pill-chat");
    await expect(pill).toBeVisible({ timeout: 15_000 });

    const href = await pill.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain(`caseFileId=${client.caseFileId}`);
  });

  test("askbar button href contains the correct caseFileId", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    // AskAssistantBar renders a Link with class lf-askbar-btn.
    const btn = page.locator("a.lf-askbar-btn");
    await expect(btn).toBeAttached({ timeout: 15_000 });

    const href = await btn.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain(`caseFileId=${client.caseFileId}`);
  });

  test("both shortcuts point to the same chat URL", async ({ page }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    const pill = page.locator("a.lf-section-nav-pill-chat");
    const btn = page.locator("a.lf-askbar-btn");

    await expect(pill).toBeVisible({ timeout: 15_000 });
    await expect(btn).toBeAttached({ timeout: 15_000 });

    const pillHref = await pill.getAttribute("href");
    const btnHref = await btn.getAttribute("href");

    // Both must resolve to the same path so the client always lands in the
    // same conversation regardless of which entry point she taps.
    expect(pillHref).toBe(btnHref);
  });

  test("following the jump-bar pill loads the chat page without error", async ({
    page,
  }) => {
    const failedResponses: { url: string; status: number }[] = [];
    page.on("response", (res) => {
      // Capture any document-level (navigation) response that is an error.
      if (res.status() >= 400 && res.request().resourceType() === "document") {
        failedResponses.push({ url: res.url(), status: res.status() });
      }
    });

    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    const pill = page.locator("a.lf-section-nav-pill-chat");
    await expect(pill).toBeVisible({ timeout: 15_000 });

    // Navigate to the chat by following the link directly (avoids needing the
    // sticky bar to be within the viewport).
    const href = await pill.getAttribute("href");
    expect(href).toBeTruthy();

    const response = await page.goto(href!);
    expect(response?.status()).toBeLessThan(400);

    // No document-level errors during the navigation.
    expect(failedResponses).toHaveLength(0);
  });

  test("following the askbar button loads the chat page without error", async ({
    page,
  }) => {
    const failedResponses: { url: string; status: number }[] = [];
    page.on("response", (res) => {
      if (res.status() >= 400 && res.request().resourceType() === "document") {
        failedResponses.push({ url: res.url(), status: res.status() });
      }
    });

    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    const btn = page.locator("a.lf-askbar-btn");
    await expect(btn).toBeAttached({ timeout: 15_000 });

    const href = await btn.getAttribute("href");
    expect(href).toBeTruthy();

    const response = await page.goto(href!);
    expect(response?.status()).toBeLessThan(400);

    expect(failedResponses).toHaveLength(0);
  });
});
