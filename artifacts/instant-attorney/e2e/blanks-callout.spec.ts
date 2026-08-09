import { test, expect } from "@playwright/test";
import { hasSupabaseAdmin } from "./helpers/env";
import {
  cleanupProvisionedClient,
  provisionClientWithDraft,
  createWorkspaceDraft,
  type ProvisionedClient,
} from "./helpers/supabase-fixtures";

/**
 * P0: Blanks-attention callout on CaseDocumentsTable.
 *
 * Verifies four behaviours without invoking AI:
 *   1. Callout appears when a workspace draft has unfilled [[blanks]].
 *   2. Clicking a document link in the callout expands that row.
 *   3. Callout disappears automatically when a re-fetch returns no blanks
 *      (driven by the running→done chat-acp/status transition, same pattern
 *      as draft-indicator.spec.ts).
 *   4. Dismissing via × persists to sessionStorage and keeps it hidden on
 *      a same-session reload.
 */

const DRAFT_TITLE = "Notice of Intent — E2E Blanks Test";
const BLANK_CONTENT =
  "Dear [[Recipient Name]],\n\nRe: [[Case Reference]]\n\nThis letter serves as formal notice.\n\nSincerely,\nClient";
const FILLED_CONTENT =
  "Dear John Smith,\n\nRe: Case 12345\n\nThis letter serves as formal notice.\n\nSincerely,\nClient";

function mockDraftsResponse(draftId: string, content: string) {
  return JSON.stringify({
    drafts: [
      {
        id: draftId,
        title: DRAFT_TITLE,
        content,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        promoted_document_id: null,
        source: "assistant",
      },
    ],
  });
}

test.describe("blanks-callout", () => {
  test.skip(
    !hasSupabaseAdmin(),
    "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY"
  );

  let client: ProvisionedClient;
  let workspaceDraftId: string;

  test.beforeAll(async () => {
    client = await provisionClientWithDraft();
    const draft = await createWorkspaceDraft(client, {
      title: DRAFT_TITLE,
      content: BLANK_CONTENT,
    });
    workspaceDraftId = draft.id;
  });

  test.afterAll(async () => {
    if (client) await cleanupProvisionedClient(client);
  });

  // ── 1. Callout appears ────────────────────────────────────────────────────

  test("callout is visible when draft has unfilled blanks", async ({ page }) => {
    // Silence the background poll so it doesn't interfere.
    await page.route("**/api/chat-acp/status**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ running: false, done: false }),
      })
    );

    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);
    await page.waitForLoadState("networkidle");

    const callout = page.locator(".cdt-blanks-callout");
    await expect(callout).toBeVisible({ timeout: 10_000 });
    await expect(callout).toContainText("1 document still needs your input");
    await expect(callout).toContainText(DRAFT_TITLE);
  });

  // ── 2. Callout link expands the correct row ───────────────────────────────

  test("clicking the callout link expands the matching row", async ({ page }) => {
    await page.route("**/api/chat-acp/status**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ running: false, done: false }),
      })
    );

    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);
    await page.waitForLoadState("networkidle");

    const callout = page.locator(".cdt-blanks-callout");
    await expect(callout).toBeVisible({ timeout: 10_000 });

    // The row starts expanded (the component pre-opens rows with blanks), but
    // click the link anyway to assert the DOM id is correct and the row is
    // reachable via the anchor.
    const link = callout.locator(".cdt-blanks-callout-link", {
      hasText: DRAFT_TITLE,
    });
    await expect(link).toBeVisible();
    await link.click();

    // Row with id="wsdraft-<id>" must be present and carry the open class.
    const row = page.locator(`#wsdraft-${workspaceDraftId}`);
    await expect(row).toBeVisible();
    await expect(row).toHaveClass(/cdt-open/);
  });

  // ── 3. Callout disappears when re-fetch returns no blanks ─────────────────

  test("callout disappears after a re-fetch that returns filled content", async ({
    page,
  }) => {
    // Mirror the draft-indicator pattern: status returns running for the first
    // two polls, then done — this triggers load() inside the component which
    // picks up the filled content on the second workspace/drafts call.
    let statusCallCount = 0;
    let draftsCallCount = 0;

    await page.route("**/api/chat-acp/status**", async (route) => {
      statusCallCount++;
      const running = statusCallCount <= 2;
      if (!running && statusCallCount === 3) {
        // First "done" response — component calls load() which fires the second
        // workspace/drafts fetch returning FILLED_CONTENT.
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(
          running
            ? { running: true, done: false }
            : { running: false, done: true }
        ),
      });
    });

    await page.route("**/api/workspace/drafts**", async (route) => {
      draftsCallCount++;
      // First call (mount): blank content → callout visible.
      // Second call (triggered by running→done transition): filled → callout gone.
      const content =
        draftsCallCount >= 2 ? FILLED_CONTENT : BLANK_CONTENT;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: mockDraftsResponse(workspaceDraftId, content),
      });
    });

    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);
    await page.waitForLoadState("networkidle");

    // Callout should be visible after the first (blank) fetch.
    const callout = page.locator(".cdt-blanks-callout");
    await expect(callout).toBeVisible({ timeout: 10_000 });

    // After the running→done edge the component re-fetches (filled content);
    // callout must disappear — no page reload. Timeout matches the poll cycle
    // (5 s active × 2 calls + a buffer).
    await expect(callout).toBeHidden({ timeout: 20_000 });
  });

  // ── 4. Dismiss writes to sessionStorage; stays gone on same-session reload ─

  test("dismiss hides callout, persists to sessionStorage, and stays gone on reload", async ({
    page,
  }) => {
    await page.route("**/api/chat-acp/status**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ running: false, done: false }),
      })
    );

    await page.setExtraHTTPHeaders({ Cookie: client.sessionCookie });
    await page.goto(`/dashboard/${client.caseFileId}`);
    await page.waitForLoadState("networkidle");

    const callout = page.locator(".cdt-blanks-callout");
    await expect(callout).toBeVisible({ timeout: 10_000 });

    // Click the × dismiss button.
    await callout.locator(".cdt-blanks-callout-dismiss").click();
    await expect(callout).toBeHidden();

    // sessionStorage must record the dismissal for this case.
    const stored = await page.evaluate(
      (id) => sessionStorage.getItem(`blanks-callout-dismissed-${id}`),
      client.caseFileId
    );
    expect(stored).toBe("1");

    // Reload within the same browser context (sessionStorage persists).
    await page.reload();
    await page.waitForLoadState("networkidle");

    // Callout must remain hidden — sessionStorage flag is respected.
    await expect(callout).toBeHidden({ timeout: 10_000 });
  });
});
