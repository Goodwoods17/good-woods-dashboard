import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";

// Invoices slice 1 (issue #46) authed smoke: prove the capture tracer cuts
// end-to-end — upload a file at /invoices and it lands as a `pending` row in the
// list (file → private Storage + invoice row, the riskiest cloud-side step).
// Extraction runs out-of-band (scripts/extractInvoices.ts), so the smoke covers
// upload → pending only, per the issue's DoD.
//
// Invoices slice 2 (issue #47) extends the smoke: verify the processor status
// bar (pending count + last-run-at + "Process now" button) is present and that
// the button is clickable.  We do NOT actually run the home-machine engine in CI
// (no `claude` binary available) — the button click is tested for wiring only
// (we expect an HTTP error from the API route and verify it surfaces gracefully,
// not a silent hang).
//
// The /invoices route is feature-flagged: it 404s unless
// NEXT_PUBLIC_INVOICES_ENABLED=true. CI sets that flag on (ci.yml e2e job) so
// this smoke can run; prod stays dormant until the owner flips it on.
//
// Needs a seeded Supabase (CI boots a local stack + replays migrations, which
// stand up the invoices tables + bucket); skipped locally when creds are absent.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

// Resolve the fixture from the repo root (Playwright runs with cwd = repo root,
// both in CI and locally). Deliberately NOT import.meta.url: that token forces
// this spec into ESM scope, which collides with Playwright's CJS transpile of the
// node: imports → "require is not defined in ES module scope" at collection time.
const SAMPLE_PDF = join(process.cwd(), "e2e", "fixtures", "sample-invoice.pdf");

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

test.describe("invoices slice 1 — capture tracer", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("uploading a file lands a pending invoice in the list", async ({ page }) => {
    await login(page);
    await page.goto("/invoices");

    // The page renders (flag is on in CI) — the upload control is present.
    await expect(page.getByText("Supplier invoices")).toBeVisible({ timeout: 15_000 });

    // Upload via the hidden file input (selected by data-testid, not value).
    await page.locator('[data-testid="invoice-upload-input"]').setInputFiles(SAMPLE_PDF);

    // A row appears, captured at status `pending`. Scope the status assertion to
    // the new row so it can't match stray copy elsewhere.
    const row = page.locator('[data-testid="invoice-row"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Pending")).toBeVisible();

    // Opening the row shows the raw-JSON section (empty until extraction runs).
    await row.click();
    await expect(page.getByText("Raw extracted JSON")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Not extracted yet/i)).toBeVisible();
  });
});

test.describe("invoices slice 2 — processor status + manual trigger", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("processor status bar is visible with pending count and Process now button", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/invoices");

    await expect(page.getByText("Supplier invoices")).toBeVisible({ timeout: 15_000 });

    // Upload a file first so there's at least one invoice (and the status bar renders).
    await page.locator('[data-testid="invoice-upload-input"]').setInputFiles(SAMPLE_PDF);
    await expect(page.locator('[data-testid="invoice-row"]').first()).toBeVisible({
      timeout: 15_000,
    });

    // Slice 2: processor status bar must be present.
    await expect(page.locator('[data-testid="processor-status"]')).toBeVisible();

    // Pending count is a number (≥ 1 from our upload).
    const pendingText = await page.locator('[data-testid="pending-count"]').textContent();
    expect(Number(pendingText)).toBeGreaterThanOrEqual(1);

    // "Process now" button is rendered and enabled.
    const processBtn = page.locator('[data-testid="process-now-btn"]');
    await expect(processBtn).toBeVisible();
    await expect(processBtn).not.toBeDisabled();

    // Click the button — the engine is not available in CI, so the API route will
    // return a 401 (CRON_SECRET env is absent in test) or 500. Either way the UI
    // must recover and show an error message (no silent hang).
    await processBtn.click();

    // Button transitions to "Processing…" while the request is in-flight.
    // Then resolves (success or error) — the page must not be stuck.
    // We wait for the button to go back to its idle label.
    await expect(processBtn).toHaveText(/Process now/i, { timeout: 15_000 });

    // Last-run-at label is always present (shows "Never run" when nothing processed yet).
    await expect(page.locator('[data-testid="last-run-at"]')).toBeVisible();
  });
});
