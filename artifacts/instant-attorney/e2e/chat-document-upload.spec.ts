import { expect, test } from "@playwright/test";
import { hasSupabaseAdmin } from "./helpers/env";
import {
  cleanupProvisionedClient,
  provisionClientWithDraft,
  type ProvisionedClient,
} from "./helpers/supabase-fixtures";

const document = {
  name: "timeline.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("A short case timeline"),
};

test.describe("chat document upload lifecycle", () => {
  test.skip(!hasSupabaseAdmin(), "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");

  let client: ProvisionedClient;

  test.beforeAll(async () => {
    client = await provisionClientWithDraft();
  });

  test.afterAll(async () => {
    if (client) await cleanupProvisionedClient(client);
  });

  test.beforeEach(async ({ page }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
  });

  test("attaching before the first message is visibly queued", async ({ page }) => {
    await page.goto("/chat");
    await page.locator('input[type="file"]').setInputFiles(document);

    await expect(page.getByText("timeline.txt")).toBeVisible();
    await expect(page.getByText(/Waiting until your case is created/)).toBeVisible();
  });

  test("a queued record uploads automatically with the same visible chip", async ({ page }) => {
    let uploads = 0;
    await page.route("**/api/attachments/upload", async (route) => {
      uploads += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
    });
    await page.route("**/api/chat-acp", (route) => route.fulfill({
      status: 200,
      contentType: "text/plain",
      body: `\x00${client.caseFileId}|test-job\x00Case created.`,
    }));
    await page.goto("/chat");
    await page.locator('input[type="file"]').setInputFiles(document);
    const chip = page.getByText("timeline.txt").locator("..");
    await page.getByRole("textbox").fill("Here is what happened.");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(chip).toContainText("added to your file");
    expect(uploads).toBe(1);
    await expect(page.getByText("timeline.txt")).toHaveCount(1);
  });

  test("a failed upload enters the error state", async ({ page }) => {
    await page.route("**/api/attachments/upload", (route) => route.fulfill({ status: 500 }));
    await page.goto(`/chat?caseFileId=${client.caseFileId}`);
    await page.locator('input[type="file"]').setInputFiles(document);

    await expect(page.getByText("failed", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry uploading timeline.txt" })).toBeVisible();
  });

  test("retry transitions a failed record back to ready", async ({ page }) => {
    let attempts = 0;
    await page.route("**/api/attachments/upload", (route) => {
      attempts += 1;
      return route.fulfill({ status: attempts === 1 ? 500 : 200, contentType: "application/json", body: "{}" });
    });
    await page.goto(`/chat?caseFileId=${client.caseFileId}`);
    await page.locator('input[type="file"]').setInputFiles(document);
    await page.getByRole("button", { name: "Retry uploading timeline.txt" }).click();

    await expect(page.getByText("added to your file", { exact: false })).toBeVisible();
    expect(attempts).toBe(2);
  });
});
