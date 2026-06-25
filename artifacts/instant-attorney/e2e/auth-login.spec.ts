import { test, expect } from "@playwright/test";
import { hasE2eCredentials } from "./helpers/env";

test.describe("auth login", () => {
  test.skip(
    !hasE2eCredentials(),
    "Set E2E_EMAIL and E2E_PASSWORD to run login tests"
  );

  test("login form reaches dashboard", async ({ page }) => {
    const email = process.env.E2E_EMAIL!;
    const password = process.env.E2E_PASSWORD!;

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();

    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
  });

  test("login API sets session cookie", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        email: process.env.E2E_EMAIL,
        password: process.env.E2E_PASSWORD,
      },
    });
    expect(res.status()).toBe(200);

    const headers = res.headersArray();
    const setCookies = headers
      .filter((h) => h.name.toLowerCase() === "set-cookie")
      .map((h) => h.value);
    expect(setCookies.length).toBeGreaterThan(0);
  });

  test("wrong password returns 401", async ({ request }) => {
    const res = await request.post("/api/auth/login", {
      data: {
        email: process.env.E2E_EMAIL,
        password: "definitely-wrong-password",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("logged-in user is redirected away from /login", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
    await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/login");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("non-attorney cannot access /attorney", async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(process.env.E2E_EMAIL!);
    await page.getByLabel("Password").fill(process.env.E2E_PASSWORD!);
    await page.getByRole("button", { name: "Sign In" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });

    await page.goto("/attorney");
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
