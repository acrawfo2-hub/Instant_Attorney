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
 * The two entry points on the cover-sheet landing:
 *   1. The memo's primary next-step button (`.lf-client-memo-primary`)
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

  test("cover-sheet next-step button href contains the correct caseFileId", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    const primary = page.locator("a.lf-client-memo-primary");
    await expect(primary).toBeVisible({ timeout: 15_000 });

    const href = await primary.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain(`caseFileId=${client.caseFileId}`);
  });

  test("askbar button href contains the correct caseFileId", async ({
    page,
  }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    const btn = page.locator("a.lf-askbar-btn");
    await expect(btn).toBeAttached({ timeout: 15_000 });

    const href = await btn.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href).toContain(`caseFileId=${client.caseFileId}`);
  });

  test("both shortcuts open the same case conversation", async ({ page }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);

    const primary = page.locator("a.lf-client-memo-primary");
    const btn = page.locator("a.lf-askbar-btn");

    await expect(primary).toBeVisible({ timeout: 15_000 });
    await expect(btn).toBeAttached({ timeout: 15_000 });

    const primaryHref = await primary.getAttribute("href");
    const btnHref = await btn.getAttribute("href");

    expect(primaryHref).toContain(`caseFileId=${client.caseFileId}`);
    expect(btnHref).toContain(`caseFileId=${client.caseFileId}`);
    expect(primaryHref).toMatch(/^\/chat\?/);
    expect(btnHref).toMatch(/^\/chat\?/);
  });

  test("following the cover-sheet next-step button loads chat without error", async ({
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

    const primary = page.locator("a.lf-client-memo-primary");
    await expect(primary).toBeVisible({ timeout: 15_000 });

    const href = await primary.getAttribute("href");
    expect(href).toBeTruthy();

    const response = await page.goto(href!);
    expect(response?.status()).toBeLessThan(400);

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
