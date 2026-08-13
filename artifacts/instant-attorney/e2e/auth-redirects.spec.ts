import { test, expect } from "@playwright/test";

/**
 * P0: Middleware auth redirects.
 * Requires a running app with NEXT_PUBLIC_SUPABASE_URL + anon key configured
 * (middleware passes through without auth when Supabase is unset).
 */
const PROTECTED_ROUTES = [
  "/dashboard",
  "/chat",
  "/onboarding",
  "/attorney",
  "/admin",
];

/**
 * Surfaces retired during the consolidation. Their API routes must be GONE, not
 * merely guarded.
 *
 * Page routes cannot prove this: middleware redirects an unauthenticated
 * request to /login whether or not the page exists, so `/wizard/demand_letter`
 * sat in PROTECTED_ROUTES above and kept passing after the wizard was deleted —
 * asserting nothing. API routes answer with JSON instead of a redirect, so a
 * deleted one is a 404 and a live one is not. That difference is the test.
 */
const RETIRED_API_ROUTES = [
  "/api/wizard",                     // chunk 5 — the wizard journey
  "/api/attorney/chat",              // chunk 6a — freestyle associate
  "/api/attorney/workspace/drafts",  // chunk 6a — the fourth draft store
  "/api/roadmap/refresh",            // chunk 4a — the roadmap spine
  "/api/assess-matter",              // chunk 4a — orphaned with MatterStandingCard
];

test.describe("auth redirects (unauthenticated)", () => {
  for (const route of PROTECTED_ROUTES) {
    test(`${route} redirects to login`, async ({ page }) => {
      await page.goto(route);
      await expect(page).toHaveURL(/\/login/);
      const url = new URL(page.url());
      expect(url.searchParams.get("redirect")).toBe(route);
    });
  }

  for (const route of RETIRED_API_ROUTES) {
    test(`${route} is gone, not just guarded`, async ({ request }) => {
      const response = await request.post(route, { data: {} });
      expect(
        response.status(),
        `${route} answered ${response.status()}. A 401/403 would mean the route still ` +
          `exists and is merely refusing; this must be a 404.`
      ).toBe(404);
    });
  }

  test("the surviving orchestrator route is still there", async ({ request }) => {
    // The control for the assertions above: if the app were simply not serving
    // /api at all, every one of them would pass for the wrong reason. This route
    // rejects an empty body, which proves it is live and reached.
    const response = await request.post("/api/chat-acp", { data: {} });
    expect(response.status()).toBe(400);
  });

  test("public routes stay accessible", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/free-chat");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
  });
});
