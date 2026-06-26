import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// The CI runner is Node 20, which ships no global WebSocket. @supabase/realtime-js
// resolves a WebSocket constructor when a client is built, so the service-role
// seed client below cannot be constructed without one. ws is always installed
// (a dependency of @supabase/realtime-js). Polyfill it for the whole spec.
(globalThis as { WebSocket?: unknown }).WebSocket ??= ws;

// Job Status slice 1 (issue #57) authed smoke: prove the tracer cuts end-to-end.
// A seeded job_item on the demo job cycles its status on tap, the change
// persists, and it survives a reload (Realtime + optimistic write through to the
// DB — the riskiest cloud-side step).
//
// The /status route is feature-flagged: it 404s unless
// NEXT_PUBLIC_JOB_STATUS_ENABLED=true. CI sets that flag on (ci.yml e2e job) so
// this smoke can run; prod stays dormant until the owner flips it on.
//
// Needs a seeded Supabase (CI boots a local stack + replays migrations, which
// stand up the job_items table) + a service-role key to seed the row directly
// (bypassing RLS). Skipped locally when any credential is absent.
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

    // 2. Open /status (flag is on in CI) — the seeded item shows, Not started.
    await login(page);
    await page.goto("/status");
    const item = page.locator('[data-testid="job-status-item"]').first();
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
    const reloaded = page.locator('[data-testid="job-status-item"]').first();
    await expect(reloaded).toBeVisible({ timeout: 15_000 });
    await expect(reloaded).toHaveAttribute("data-status", "done");

    // 5. The status also landed in the DB (the write reached the cloud).
    const { data, error } = await sb
      .from("job_items")
      .select("status")
      .eq("job_id", DEMO_JOB_ID)
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("done");
  });
});
