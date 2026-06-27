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

    // S7: the timeline now lives inside the Schedule tab — click it first.
    await page.getByRole("button", { name: /^Schedule$/i }).click();

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

    // S7: timeline lives inside the Schedule tab.
    await page.getByRole("button", { name: /^Schedule$/i }).click();

    const timeline = page.getByTestId("schedule-timeline");
    await expect(timeline).toBeVisible({ timeout: 15_000 });

    // Risk buffer breakdown row renders below the phase timeline.
    const breakdown = page.getByTestId("risk-buffer-breakdown");
    await expect(breakdown).toBeVisible();
    await expect(breakdown).toContainText(/base/i);
  });
});

// Scheduling S5 — editable Gantt + auto-ripple + pinnable anchors (issue #93).
// The GanttSchedule component renders on the job detail page behind the feature
// flag. It contains: phase pin controls, the Frappe Gantt container, an undo
// button when there's a pending preview, and a proposed-changes table.
// This smoke confirms the section renders and the pin buttons are present.
// Drag-to-reschedule requires real user gestures and is covered by the unit
// tests for rippleForward / pullPlanBackward in gantt.test.ts.
test.describe("scheduling slice 5 — editable Gantt (tracer smoke)", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("job detail page renders the editable Gantt section with phase pin controls", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // S7: the Gantt now lives inside the Schedule tab — navigate there first.
    await page.getByRole("button", { name: /^Schedule$/i }).click();

    // The Gantt section renders (feature flag on in CI).
    const gantt = page.getByTestId("gantt-schedule");
    await expect(gantt).toBeVisible({ timeout: 15_000 });

    // The Gantt container div is present (Frappe Gantt renders inside it).
    await expect(gantt.getByTestId("gantt-container")).toBeVisible();

    // All six phase pin buttons are present.
    for (const phase of ["design", "cnc", "assembly", "finishing", "delivery", "install"]) {
      await expect(gantt.getByTestId(`gantt-pin-${phase}`)).toBeVisible();
    }

    // No pending ripple on first load → apply/undo buttons are hidden.
    await expect(page.getByTestId("gantt-apply")).not.toBeVisible();
    await expect(page.getByTestId("gantt-undo")).not.toBeVisible();
  });

  test("pinning Install triggers pull-plan backward and shows preview table", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // S7: navigate to the Schedule tab first.
    await page.getByRole("button", { name: /^Schedule$/i }).click();

    const gantt = page.getByTestId("gantt-schedule");
    await expect(gantt).toBeVisible({ timeout: 15_000 });

    // Pin Install — triggers pull-plan backward from install date.
    const installPin = gantt.getByTestId("gantt-pin-install");
    await installPin.click();

    // After pinning, the install pin shows as pressed.
    await expect(installPin).toHaveAttribute("aria-pressed", "true");

    // The preview table should now be visible (pull-plan computed new dates).
    const previewTable = gantt.getByTestId("gantt-preview-table");
    await expect(previewTable).toBeVisible({ timeout: 5_000 });

    // Undo button appears when there's a pending preview.
    await expect(gantt.getByTestId("gantt-undo")).toBeVisible();

    // Clicking Undo clears the preview.
    await gantt.getByTestId("gantt-undo").click();
    await expect(previewTable).not.toBeVisible();
  });
});

// Scheduling S7 — Job-detail Schedule tab + overview widget (issue #95).
// The Schedule tab consolidates the full schedule hub (timeline, Gantt, committed-vs-target,
// share + Google-push entry points) and the Overview tab gains a compact schedule-health
// widget. Both gate on NEXT_PUBLIC_SCHEDULING_ENABLED.
test.describe("scheduling slice 7 — Schedule tab + overview widget", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("job detail shows a Schedule tab in the nav bar", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // The Schedule tab is visible in the nav when the flag is on.
    const scheduleTab = page.getByRole("button", { name: /^Schedule$/i });
    await expect(scheduleTab).toBeVisible({ timeout: 15_000 });
  });

  test("clicking Schedule tab shows the schedule-tab panel with overview, timeline, and Gantt", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    await page.getByRole("button", { name: /^Schedule$/i }).click();

    // Schedule tab content is visible.
    const tab = page.getByTestId("schedule-tab");
    await expect(tab).toBeVisible({ timeout: 15_000 });

    // Committed-vs-target status badge renders.
    await expect(tab.getByTestId("schedule-tab-status")).toBeVisible();

    // The phase timeline renders inside the tab.
    await expect(page.getByTestId("schedule-timeline")).toBeVisible();

    // The Gantt renders inside the tab.
    await expect(page.getByTestId("gantt-schedule")).toBeVisible();

    // Share entry points render.
    await expect(tab.getByTestId("schedule-share-ics")).toBeVisible();
    await expect(tab.getByTestId("schedule-share-section")).toBeVisible();
  });

  test("Overview tab shows the compact schedule-health widget", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // Overview is the default tab — the widget should already be visible.
    const widget = page.getByTestId("schedule-health-widget");
    await expect(widget).toBeVisible({ timeout: 15_000 });

    // The schedule status pill is present.
    await expect(widget.getByTestId("schedule-health-status")).toBeVisible();

    // The committed install date is shown (seeded job has install_date 2026-12-15).
    await expect(widget).toContainText(/Install/i);

    // Buffer days render (seeded with 10d).
    await expect(widget).toContainText(/10d/);

    // The internal target renders (seeded with 2026-12-01).
    await expect(widget).toContainText(/Internal target/i);
  });

  test("seeded DEMO job has behind status on the Schedule tab (cnc target is in the past)", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    await page.getByRole("button", { name: /^Schedule$/i }).click();

    const tab = page.getByTestId("schedule-tab");
    await expect(tab).toBeVisible({ timeout: 15_000 });

    // The seeded CNC target is 2020-02-01 (past) and current milestone is cnc → Behind.
    const statusBadge = tab.getByTestId("schedule-tab-status");
    await expect(statusBadge).toHaveAttribute("data-status", "behind");
    await expect(statusBadge).toHaveText(/Behind/i);
  });
});
