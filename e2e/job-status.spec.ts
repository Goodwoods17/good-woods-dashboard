import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// The CI runner is Node 20, which ships no global WebSocket. @supabase/realtime-js
// resolves a WebSocket constructor when a client is built, so the service-role
// seed client below cannot be constructed without one. ws is always installed
// (a dependency of @supabase/realtime-js). Polyfill it for the whole spec.
(globalThis as { WebSocket?: unknown }).WebSocket ??= ws;

// Job Status authed smoke tests (issues #57 and #58).
//
// The /status route is feature-flagged: it 404s unless
// NEXT_PUBLIC_JOB_STATUS_ENABLED=true. CI sets that flag on (ci.yml e2e job) so
// this smoke can run; prod stays dormant until the owner flips it on.
//
// Needs a seeded Supabase (CI boots a local stack + replays migrations, which
// stand up the job_items + phase_step_templates tables) + a service-role key to
// seed rows directly (bypassing RLS). Skipped locally when any credential is absent.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_JOB_ID = "job-status-demo";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  // Click, not Enter — Enter can submit before React state settles (gw-auth-and-rls).
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("link", { name: "Estimator" })).toBeVisible({
    timeout: 15_000,
  });
}

// ─── Slice 1 (issue #57) — live status cycle tracer ──────────────────────────

test.describe("job status slice 1 — live status cycle tracer", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY + a seeded Supabase"
  );

  test("tapping a seeded item cycles its status, persists, and survives reload", async ({
    page,
  }) => {
    // 1. Seed one job_item on the demo job via service role (bypasses RLS).
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });
    // Clear rows from a prior failed attempt so the row count is deterministic.
    await sb.from("job_items").delete().eq("job_id", DEMO_JOB_ID);
    const { error: seedErr } = await sb.from("job_items").insert({
      job_id: DEMO_JOB_ID,
      phase: "assembly",
      label: "E2E tracer step",
      source: "adhoc",
      status: "not_started",
      visibility: "owner",
      sort_order: 0,
    });
    expect(seedErr).toBeNull();

    // 2. Open /status (flag is on in CI). Slice 2 auto-materialises template
    //    steps on open, so the job now holds many items — target the seeded one
    //    by its label, not a positional .first() (which would land on a design
    //    template item that sorts ahead of assembly).
    await login(page);
    await page.goto("/status");
    // Scope to the status-item testid: slice 3's timeline adds an item-picker
    // button ("Add note or photo to E2E tracer step") that a bare name-regex
    // would also match (strict-mode violation).
    const item = page.getByTestId("job-status-item").filter({ hasText: "E2E tracer step" });
    await expect(item).toBeVisible({ timeout: 15_000 });
    await expect(item).toHaveAttribute("data-status", "not_started");

    // 3. Tap to cycle: not_started → in_progress → blocked → done.
    await item.click();
    await expect(item).toHaveAttribute("data-status", "in_progress");
    await item.click();
    await expect(item).toHaveAttribute("data-status", "blocked");
    await item.click();
    await expect(item).toHaveAttribute("data-status", "done");

    // 4. Reload — the 'done' status persisted to the DB, not just local state.
    await page.reload();
    const reloaded = page.getByTestId("job-status-item").filter({ hasText: "E2E tracer step" });
    await expect(reloaded).toBeVisible({ timeout: 15_000 });
    await expect(reloaded).toHaveAttribute("data-status", "done");

    // 5. The status also landed in the DB (the write reached the cloud). Scope
    //    to the seeded row by label — the job holds many materialised items now.
    const { data, error } = await sb
      .from("job_items")
      .select("status")
      .eq("job_id", DEMO_JOB_ID)
      .eq("label", "E2E tracer step")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("done");
  });
});

// ─── Slice 3 (issue #59) — photos + notes (event timeline) ──────────────────

test.describe("job status slice 3 — photos + notes + event timeline", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY + a seeded Supabase"
  );

  test("attaching a note to an item appears in the timeline", async ({ page }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Seed one known item so the timeline item picker always has a target.
    await sb.from("job_items").delete().eq("job_id", DEMO_JOB_ID);
    await sb.from("job_item_events").delete().eq("job_id", DEMO_JOB_ID);
    const { data: seedData, error: seedErr } = await sb
      .from("job_items")
      .insert({
        job_id: DEMO_JOB_ID,
        phase: "assembly",
        label: "E2E note target",
        source: "adhoc",
        status: "not_started",
        visibility: "owner",
        sort_order: 0,
      })
      .select()
      .single();
    expect(seedErr).toBeNull();
    const itemId = (seedData as { id: string }).id;

    await login(page);
    await page.goto("/status");

    // The item-timeline section is present.
    await expect(page.getByTestId("item-timeline")).toBeVisible({ timeout: 15_000 });

    // Initially the timeline shows "No activity yet."
    await expect(page.getByText("No activity yet.")).toBeVisible({ timeout: 10_000 });

    // Pick the seeded item from the item picker.
    const pickerBtn = page.getByRole("button", { name: /Add note or photo to E2E note target/i });
    await expect(pickerBtn).toBeVisible({ timeout: 10_000 });
    await pickerBtn.click();

    // The capture form opens.
    await expect(page.getByTestId("capture-form")).toBeVisible();

    // Fill in a note and submit.
    await page.getByLabel("Note text").fill("Cabinet looking great");
    await page.getByTestId("capture-submit-btn").click();

    // The form closes and the note appears in the timeline.
    await expect(page.getByTestId("capture-form")).not.toBeVisible({ timeout: 5_000 });
    await expect(page.getByTestId("timeline-event")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Cabinet looking great")).toBeVisible({ timeout: 10_000 });

    // The event row is also in the DB.
    const { data: evtData, error: evtErr } = await sb
      .from("job_item_events")
      .select("*")
      .eq("job_id", DEMO_JOB_ID)
      .eq("item_id", itemId)
      .single();
    expect(evtErr).toBeNull();
    expect((evtData as { event_type: string }).event_type).toBe("note");
    expect((evtData as { note: string }).note).toBe("Cabinet looking great");
  });

  test("timeline renders without errors when there are no events", async ({ page }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });
    // Wipe events so the empty state is deterministic.
    await sb.from("job_item_events").delete().eq("job_id", DEMO_JOB_ID);

    await login(page);
    await page.goto("/status");

    await expect(page.getByTestId("item-timeline")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("No activity yet.")).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Slice 2 (issue #58) — templates + full mobile field view ────────────────

test.describe("job status slice 2 — template materialisation + full field view", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY + a seeded Supabase"
  );

  test("opening a job materialises template steps across all 6 phases", async ({ page }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clear any previously materialised items for the demo job so we get a
    // clean materialisation (proves the idempotent path too on subsequent runs).
    await sb.from("job_items").delete().eq("job_id", DEMO_JOB_ID);

    await login(page);
    await page.goto("/status");

    // The tab is visible.
    await expect(page.getByTestId("job-status-tab")).toBeVisible({ timeout: 15_000 });

    // After materialisation, all 6 phase sections should appear.
    const phases = ["design", "cnc", "assembly", "finishing", "delivery", "install"];
    for (const phase of phases) {
      await expect(page.getByTestId(`phase-section-${phase}`)).toBeVisible({
        timeout: 15_000,
      });
    }

    // At least one template item should be present in the assembly phase.
    const assemblySection = page.getByTestId("phase-section-assembly");
    const assemblyItems = assemblySection.locator('[data-testid="job-status-item"]');
    await expect(assemblyItems.first()).toBeVisible({ timeout: 15_000 });

    // Progress bars are rendered (assembly starts at 0%).
    await expect(page.getByTestId("phase-progress-assembly")).toBeVisible();
    await expect(page.getByTestId("job-progress-bar")).toBeVisible();
  });

  test("cycling a template item updates per-phase and job progress", async ({ page }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Ensure templates are materialised (previous test may have done it, but
    // isolate: clear and let the page materialise fresh).
    await sb.from("job_items").delete().eq("job_id", DEMO_JOB_ID);

    await login(page);
    await page.goto("/status");

    // Wait for template items to appear in assembly.
    const assemblySection = page.getByTestId("phase-section-assembly");
    const firstItem = assemblySection.locator('[data-testid="job-status-item"]').first();
    await expect(firstItem).toBeVisible({ timeout: 15_000 });
    await expect(firstItem).toHaveAttribute("data-status", "not_started");

    // Overall progress starts at 0%.
    await expect(page.getByTestId("job-progress-pct")).toHaveText("0%");

    // Cycle the first assembly item through to done.
    await firstItem.click();
    await expect(firstItem).toHaveAttribute("data-status", "in_progress");
    await firstItem.click();
    await expect(firstItem).toHaveAttribute("data-status", "blocked");
    await firstItem.click();
    await expect(firstItem).toHaveAttribute("data-status", "done");

    // Overall progress should now be non-zero.
    const pctText = await page.getByTestId("job-progress-pct").textContent();
    expect(parseInt(pctText ?? "0", 10)).toBeGreaterThan(0);
  });

  test("adding an ad-hoc step to a phase creates a new item", async ({ page }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Ensure templates are materialised.
    await sb.from("job_items").delete().eq("job_id", DEMO_JOB_ID);

    await login(page);
    await page.goto("/status");

    // Wait for the assembly phase section to be ready.
    await expect(page.getByTestId("phase-section-assembly")).toBeVisible({ timeout: 15_000 });
    // Wait for template items to materialise.
    await expect(
      page.getByTestId("phase-section-assembly").locator('[data-testid="job-status-item"]').first()
    ).toBeVisible({ timeout: 15_000 });

    // Click "Add step" for the assembly phase.
    await page.getByTestId("add-step-btn-assembly").click();

    // The inline input should appear. Use aria-label, not value attribute selector
    // (React controlled inputs set the .value PROPERTY, not the HTML attribute).
    const input = page.getByLabel("New step for Assembly");
    await expect(input).toBeVisible();
    await input.fill("E2E ad-hoc step");

    // Submit.
    await page.getByTestId("add-step-submit-assembly").click();

    // The new item should appear in the assembly section.
    const assemblyItems = page
      .getByTestId("phase-section-assembly")
      .locator('[data-testid="job-status-item"]');
    const newItem = assemblyItems.filter({ hasText: "E2E ad-hoc step" });
    await expect(newItem).toBeVisible({ timeout: 10_000 });
    await expect(newItem).toHaveAttribute("data-status", "not_started");
  });
});
