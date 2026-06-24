import { test, expect } from "@playwright/test";

// Step 1 (tracer): prove the harness drives the real app in a browser. This
// needs no database — the login page renders client-side. The authed flow
// (login → open seeded job) is added once `supabase start` + seeding are wired
// into CI. See docs/superpowers/specs/2026-06-24-ci-e2e-smoke-design.md.
test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(
    page.getByRole("heading", { name: /sign in/i }),
  ).toBeVisible();
  await expect(page.locator('input[type="email"]')).toBeVisible();
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible();
});
