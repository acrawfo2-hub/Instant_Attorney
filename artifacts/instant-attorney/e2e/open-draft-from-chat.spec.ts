import { test, expect } from "@playwright/test";
import { hasSupabaseAdmin } from "./helpers/env";
import {
  cleanupProvisionedClient,
  createWorkspaceDraft,
  provisionClientWithDraft,
  type ProvisionedClient,
} from "./helpers/supabase-fixtures";

/**
 * P0: "I clicked Open draft and I can't see the document."
 *
 * The reported failure was indistinguishable from having no drafts at all,
 * because the panel rendered its empty state for three different situations:
 * still loading, the fetch failed, and the requested draft is gone. These tests
 * pin all three apart, and — most importantly — assert that the deep link
 * actually puts the document's TEXT on screen, not merely that a panel opened.
 *
 * No AI is invoked; the only mocked route is the deliberate failure case.
 */
test.describe("opening a draft from the chat", () => {
  test.skip(
    !hasSupabaseAdmin(),
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );

  let client: ProvisionedClient;
  let draft: { id: string; title: string; content: string };
  let otherDraft: { id: string; title: string; content: string };

  test.beforeAll(async () => {
    client = await provisionClientWithDraft();
    // Two drafts, so "showed the right one" is a real assertion rather than
    // something a single-item list would pass by accident.
    otherDraft = await createWorkspaceDraft(client, {
      title: "Inventory and Appraisement",
      content: "Community estate inventory for the Playwright fixture matter.",
    });
    draft = await createWorkspaceDraft(client, {
      title: "Original Answer",
      content: "GENERAL DENIAL. Respondent denies each allegation. Filed in [[County]] County.",
    });
  });

  test.afterAll(async () => {
    if (client) await cleanupProvisionedClient(client);
  });

  test("a ?draft= deep link shows that draft's actual text, not just a panel", async ({ page }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/chat?caseFileId=${client.caseFileId}&draft=${draft.id}`);

    const pane = page.locator(".fc-draft-pane");
    await expect(pane).toBeVisible({ timeout: 15_000 });

    // The title input carries the draft's name…
    await expect(pane.locator(".fs-draft-title")).toHaveValue(draft.title, { timeout: 15_000 });

    // …and the body actually renders the document. This is the assertion the
    // bug report was really about: the panel opening is not the same as the
    // client being able to read the document.
    await expect(pane.locator(".fc-draft-preview")).toContainText("GENERAL DENIAL");

    // The blank is surfaced rather than swallowed by the preview renderer.
    await expect(pane.locator(".fc-draft-blank-mark")).toContainText("County");

    // And it is the requested draft, not merely the first one in the list.
    await expect(pane.locator(".fc-draft-preview")).not.toContainText("Community estate inventory");
  });

  test("switching drafts via the tabs shows the other document's text", async ({ page }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/chat?caseFileId=${client.caseFileId}&draft=${draft.id}`);

    const pane = page.locator(".fc-draft-pane");
    await expect(pane.locator(".fs-draft-title")).toHaveValue(draft.title, { timeout: 15_000 });

    await pane.getByRole("button", { name: otherDraft.title }).click();
    await expect(pane.locator(".fs-draft-title")).toHaveValue(otherDraft.title);
    await expect(pane.locator(".fc-draft-preview")).toContainText("Community estate inventory");
  });

  test("a draft that no longer exists says so instead of quietly opening another", async ({ page }) => {
    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/chat?caseFileId=${client.caseFileId}&draft=00000000-0000-4000-8000-000000000000`);

    const pane = page.locator(".fc-draft-pane");
    await expect(pane).toBeVisible({ timeout: 15_000 });
    // Something is shown (the client isn't stranded), but the swap is explicit.
    await expect(pane.getByText(/isn.t in your drafts any more/i)).toBeVisible({ timeout: 15_000 });
  });

  test("a failed load offers a retry instead of looking like an empty drafts list", async ({ page }) => {
    await page.route("**/api/workspace/drafts**", (route) =>
      route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"boom"}' })
    );

    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/chat?caseFileId=${client.caseFileId}&draft=${draft.id}`);

    const pane = page.locator(".fc-draft-pane");
    await expect(pane).toBeVisible({ timeout: 15_000 });
    await expect(pane.getByText(/couldn.t be loaded/i)).toBeVisible({ timeout: 15_000 });
    await expect(pane.getByRole("button", { name: "Try again" })).toBeVisible();

    // The misleading empty-state copy must NOT be what a failure looks like.
    await expect(pane.getByText(/Drafts you create here appear in this panel/i)).toBeHidden();
  });
});
