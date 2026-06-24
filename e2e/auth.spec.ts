import { test, expect } from "@playwright/test";

// Authed smoke: the core "a real user can log in and reach their data" path.
// Exercises auth + session cookie + middleware gate + an authed render — the
// class of interactive bug tsc/lint/jsdom can't see. Needs a seeded Supabase
// (the CI job boots a local stack + seeds the user); skipped locally when the
// E2E creds aren't present so `npx playwright test` still runs the DB-free spec.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test.describe("authenticated smoke", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("logs in and lands on the authed dashboard", async ({ page }) => {
    await page.goto("/login");

    await page.locator('input[type="email"]').fill(email!);
    await page.locator('input[type="password"]').fill(password!);
    // Click the button, not Enter — Enter can submit before React state settles
    // (gw-auth-and-rls memory).
    await page.getByRole("button", { name: /sign in/i }).click();

    // Middleware lets the authed session through to "/" (the Pipeline dashboard);
    // the authed shell renders the sidebar nav. If login silently failed we'd be
    // bounced back to /login and this would fail.
    await expect(page.getByRole("link", { name: "Estimator" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).not.toHaveURL(/\/login/);
  });
});
