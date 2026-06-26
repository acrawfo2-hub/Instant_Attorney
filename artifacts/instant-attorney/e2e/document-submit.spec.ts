import { test, expect } from "@playwright/test";
import { hasSupabaseAdmin } from "./helpers/env";
import {
  cleanupProvisionedClient,
  provisionClientWithDraft,
  type ProvisionedClient,
} from "./helpers/supabase-fixtures";

/**
 * P0: Document submit path — AI-free.
 * Seeds a draft row via service role, logs in, POSTs submit, verifies pending_review.
 */
test.describe("document submit", () => {
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

  test("POST /api/documents/[id]/submit moves draft to pending_review", async ({
    request,
  }) => {
    const res = await request.post(`/api/documents/${client.documentId}/submit`, {
      headers: { Cookie: client.sessionCookie },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe("pending_review");
    expect(body.submitted_at).toBeTruthy();
  });

  test("client lookup reflects submitted status", async ({ request }) => {
    const res = await request.get(
      `/api/documents/lookup?caseFileId=${client.caseFileId}&docType=demand_letter`,
      { headers: { Cookie: client.sessionCookie } }
    );
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.id).toBe(client.documentId);
    expect(body.status).toBe("pending_review");
    expect(body.submitted_at).toBeTruthy();
  });

  test("submit is idempotent for already-queued document", async ({
    request,
  }) => {
    const res = await request.post(`/api/documents/${client.documentId}/submit`, {
      headers: { Cookie: client.sessionCookie },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("pending_review");
  });

  test("unauthenticated submit returns 401", async ({ request }) => {
    const res = await request.post(
      `/api/documents/${client.documentId}/submit`
    );
    expect(res.status()).toBe(401);
  });
});
