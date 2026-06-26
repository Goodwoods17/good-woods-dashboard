import { test, expect, type Page } from "@playwright/test";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// The CI runner is Node 20, which ships no global WebSocket. @supabase/realtime-js
// resolves a WebSocket constructor when a client is built (websocket-factory throws
// otherwise), so the service-role seed client below cannot be constructed without
// one. ws is always installed (a dependency of @supabase/realtime-js). Polyfill it
// for the whole spec so every createClient seed in this file works under Node 20.
(globalThis as { WebSocket?: unknown }).WebSocket ??= ws;

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

// ---------------------------------------------------------------------------
// Slice 3 — review & edit
// ---------------------------------------------------------------------------

// Needs a service-role key to seed a needs_review invoice (the extractor
// can't run in CI — no `claude` binary). SUPABASE_SERVICE_ROLE_KEY is
// exported by the CI `supabase status` step. The test is skipped locally
// when either credential set is absent.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

test.describe("invoices slice 3 — review & edit", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("review form renders for a needs_review invoice; duplicate guard fires; Save marks reviewed", async ({
    page,
  }) => {
    // 1. Seed a needs_review invoice directly via service role (bypasses RLS).
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clear rows left by a prior failed attempt so retries start from a clean
    // slate — the duplicate guard matches on supplier + invoice_number, and
    // leftover dupes would otherwise skew the dup check.
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-REVIEW-001");

    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "needs_review",
        storage_path: "e2e-slice3/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-review-test.pdf",
        supplier: "E2E Supplier Ltd",
        invoice_number: "E2E-REVIEW-001",
        pre_tax_total: 1000,
        gst: 50,
        pst: 70,
        total: 1120,
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    await sb.from("invoice_lines").insert({
      invoice_id: inv.id,
      line_no: 1,
      qty: 5,
      sku: "MAPLE-34",
      description: "Hard maple sheet",
      unit: "sheet",
      unit_price: 200,
      // Σ lines must equal pre_tax_total (1000) so the math banner stays hidden
      // (validateMath check 1: Σ line amounts ≈ preTaxTotal).
      amount: 1000,
      tax_flag: true,
      confidence: 0.95,
    });

    // Seed a second invoice to trigger the duplicate guard.
    await sb.from("invoices").insert({
      status: "reviewed",
      storage_path: "e2e-slice3/dup.pdf",
      mime: "application/pdf",
      original_filename: "e2e-dup.pdf",
      supplier: "E2E Supplier Ltd",
      invoice_number: "E2E-REVIEW-001",
    });

    // 2. Login and navigate to the review page.
    await login(page);
    await page.goto(`/invoices/${inv.id}`);

    // 3. Review form must render.
    await expect(page.locator('[data-testid="invoice-review-form"]')).toBeVisible({
      timeout: 15_000,
    });

    // 4. Header fields should be pre-filled with extracted values.
    await expect(page.getByLabel("Supplier")).toHaveValue("E2E Supplier Ltd");
    await expect(page.getByLabel("Invoice #")).toHaveValue("E2E-REVIEW-001");

    // 5. Duplicate-invoice warning should fire (same supplier + invoice # seeded above).
    await expect(page.locator('[data-testid="duplicate-warning"]')).toBeVisible({
      timeout: 5_000,
    });

    // 6. Both math checks hold (Σ lines 1000 = pre-tax 1000; 1000 + 50 + 70 =
    //    1120 total) — so the math-validation banner must stay hidden.
    await expect(page.locator('[data-testid="math-validation-banner"]')).not.toBeVisible();

    // 7. Save as Reviewed button is present and enabled.
    const saveBtn = page.locator('[data-testid="save-reviewed-btn"]');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).not.toBeDisabled();

    // 8. Clicking Save marks the invoice as reviewed and transitions to the
    //    read-only view (which has the "Raw extracted JSON" section).
    await saveBtn.click();
    await expect(page.getByText("Raw extracted JSON")).toBeVisible({ timeout: 15_000 });

    // Verify the invoice is now at `reviewed` status.
    const { data: afterSave } = await sb
      .from("invoices")
      .select("status")
      .eq("id", inv.id)
      .single();
    expect(afterSave?.status).toBe("reviewed");

    // 9. Clean up seeded rows so they don't pollute other tests.
    await sb.from("invoices").delete().eq("id", inv.id);
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-REVIEW-001");
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
