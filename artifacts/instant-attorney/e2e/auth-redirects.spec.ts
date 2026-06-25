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
  "/wizard/demand_letter",
  "/attorney",
  "/admin",
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

  test("public routes stay accessible", async ({ page }) => {
    await page.goto("/");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/free-chat");
    await expect(page).not.toHaveURL(/\/login/);

    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
  });
});
