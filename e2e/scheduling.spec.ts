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

// Scheduling S2 — phase-level capacity/load model (issue #90). The Capacity tab
// on /labour only appears when NEXT_PUBLIC_SCHEDULING_ENABLED=true. The seed
// shrinks the `assembly` work-center to 4h capacity and logs 6h of assembly
// time this window → "over capacity"; 1h of design time stays under its 40h
// default → "has room". Derived default phase durations also render.
test.describe("scheduling slice 2 — phase capacity/load model", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("the Capacity tab shows per-phase load vs capacity + derived durations", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/labour");

    await page.getByRole("button", { name: "Capacity" }).click();

    const panel = page.getByTestId("phase-capacity-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // All six work-centers render a capacity row.
    for (const phase of ["design", "cnc", "assembly", "finishing", "delivery", "install"]) {
      await expect(panel.getByTestId(`capacity-row-${phase}`)).toBeVisible();
    }

    // Assembly is seeded over capacity; design has room.
    await expect(panel.getByTestId("capacity-row-assembly")).toHaveAttribute("data-status", "over");
    await expect(panel.getByTestId("capacity-row-design")).toHaveAttribute("data-status", "under");

    // The derived default phase durations for a new job render too.
    await expect(panel.getByTestId("duration-row-assembly")).toBeVisible();
  });
});

// Scheduling S4 — auto-draft schedule from Job template (issue #92).
// When NEXT_PUBLIC_SCHEDULING_ENABLED=true, the /jobs/new full-mode form shows a
// TemplateDraftPanel that previews the template-derived schedule before the user
// creates the job. Switching templates updates the preview. No Supabase write
// needed for this check — just the rendered form.
test.describe("scheduling slice 4 — template draft preview on new-job form", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("full-mode new job form shows a schedule preview for the selected template", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/jobs/new");

    // Switch to Full intake mode (default is Quick which hides the Template card).
    await page.getByRole("button", { name: /^Full$/i }).click();

    // The TemplateDraftPanel should appear in the Template card.
    const panel = page.getByTestId("template-draft-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // The panel starts on "full_project" (the default template).
    await expect(panel).toHaveAttribute("data-template", "full_project");

    // All six phases are rendered; non-skipped phases show dates, not "—".
    for (const phase of ["design", "cnc", "assembly", "finishing", "delivery", "install"]) {
      await expect(panel.getByTestId(`draft-phase-${phase}`)).toBeVisible();
    }

    // The "full_project" template has non-zero time for design — must show a date.
    const designRow = panel.getByTestId("draft-phase-design");
    await expect(designRow).not.toContainText("—");

    // The internal finish date renders.
    await expect(panel.getByTestId("draft-internal-target")).toBeVisible();

    // Switch to "Install Only" template — only delivery + install have dates.
    await page.getByRole("button", { name: /install only/i }).click();
    await expect(panel).toHaveAttribute("data-template", "install_only");

    // design/cnc/assembly/finishing are skipped (0 days) in install_only.
    const designRowAfter = panel.getByTestId("draft-phase-design");
    await expect(designRowAfter).toContainText("—");
  });
});

// Scheduling S6 — buffer burn + fever chart + recovery flag (issue #94).
// The demo job has internal_target_date = "2026-12-01" (future) and
// install_date already seeded. Since internal target is in the future, buffer
// consumed = 0 → zone = green → no recovery flag. The fever section and
// chart should still render.
test.describe("scheduling slice 6 — buffer burn + fever chart + recovery flag", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("job detail shows the fever section with chart, no recovery flag when safe", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    const timeline = page.getByTestId("schedule-timeline");
    await expect(timeline).toBeVisible({ timeout: 15_000 });

    // Fever section renders.
    const feverSection = page.getByTestId("fever-section");
    await expect(feverSection).toBeVisible();

    // The SVG fever chart renders.
    const chart = page.getByTestId("fever-chart");
    await expect(chart).toBeVisible();

    // The demo job's internal target (2026-12-01) is in the future, so
    // buffer is not consumed → zone should be green or yellow (not red),
    // and the recovery flag must NOT appear.
    await expect(page.getByTestId("recovery-flag")).not.toBeVisible();
  });
});

// Scheduling S3 — capacity-aware committed date + risk-tiered buffer +
// floating-bottleneck detection (issue #91). The seed already puts assembly
// over capacity (6h logged vs 4h configured), so assembly must be the
// floating bottleneck. The capacity-aware date section and risk buffer
// breakdown both render on the Capacity tab.
test.describe("scheduling slice 3 — capacity-aware date + risk buffer + bottleneck", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("Capacity tab shows floating bottleneck (assembly) + recommended commit date", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/labour");

    await page.getByRole("button", { name: "Capacity" }).click();

    const panel = page.getByTestId("phase-capacity-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // Floating bottleneck banner appears — assembly is the most-overloaded phase.
    const bottleneck = page.getByTestId("floating-bottleneck");
    await expect(bottleneck).toBeVisible();
    await expect(bottleneck).toHaveAttribute("data-phase", "assembly");
    await expect(bottleneck).toContainText(/Assembly/i);

    // Capacity-aware date section renders with a recommended commit date.
    const dateSection = page.getByTestId("capacity-aware-date-section");
    await expect(dateSection).toBeVisible();
    await expect(page.getByTestId("recommended-commit-date")).toBeVisible();
  });

  test("job detail schedule timeline shows a risk-buffer breakdown", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    const timeline = page.getByTestId("schedule-timeline");
    await expect(timeline).toBeVisible({ timeout: 15_000 });

    // Risk buffer breakdown row renders below the phase timeline.
    const breakdown = page.getByTestId("risk-buffer-breakdown");
    await expect(breakdown).toBeVisible();
    await expect(breakdown).toContainText(/base/i);
  });
});
