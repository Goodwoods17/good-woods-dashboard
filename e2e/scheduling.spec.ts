import { test, expect, type Page } from "@playwright/test";

// Scheduling & Client-Commitment Engine — S1 foundation smoke (issue #89).
//
// The read-only schedule timeline on a job's detail page is feature-flagged: it
// only renders when NEXT_PUBLIC_SCHEDULING_ENABLED=true. CI sets that flag on
// for the e2e job; prod stays dormant until the owner flips it on.
//
// Needs a seeded Supabase (CI boots a local stack + replays migrations, which
// add jobs.phase_target_dates / internal_target_date / buffer_days) + the e2e
// user. The demo job is seeded by scripts/seed-e2e.mjs with a PAST current-phase
// (cnc) target, so the badge must read "Behind". Skipped locally without creds.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const DEMO_JOB_ID = "job-status-demo";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  // Click, not Enter — Enter can submit before React state settles (gw-auth-and-rls).
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("link", { name: "Estimator" })).toBeVisible({ timeout: 15_000 });
}

test.describe("scheduling slice 1 — read-only timeline tracer", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("opening a job shows the 6-phase timeline, committed date, buffer + a behind badge", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    const timeline = page.getByTestId("schedule-timeline");
    await expect(timeline).toBeVisible({ timeout: 15_000 });

    // All six phases render in the timeline.
    for (const label of ["Design", "CNC / Cut", "Assembly", "Finishing", "Delivery", "Install"]) {
      await expect(timeline.getByText(label, { exact: true })).toBeVisible();
    }

    // Committed install date + pooled buffer surface.
    await expect(timeline.getByText(/Committed install/)).toBeVisible();
    await expect(timeline.getByText("10d", { exact: true })).toBeVisible();

    // The seeded current-phase (cnc) target is in the past → "Behind".
    const badge = page.getByTestId("schedule-status-badge");
    await expect(badge).toHaveAttribute("data-status", "behind");
    await expect(badge).toHaveText(/Behind/);
  });
});
