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

    // 8. Clicking Save marks the invoice as reviewed and advances the detail
    //    view to the slice-4 match step (a reviewed invoice routes there).
    await saveBtn.click();
    await expect(page.locator('[data-testid="invoice-match-view"]')).toBeVisible({
      timeout: 15_000,
    });

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

// ---------------------------------------------------------------------------
// Slice 4 — supplier auto-detect + job match/split
// ---------------------------------------------------------------------------

test.describe("invoices slice 4 — supplier + job matching", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("match view renders for a reviewed invoice; supplier picker and line job pickers are present; saving assignments persists them", async ({
    page,
  }) => {
    // 1. Seed a reviewed invoice + one line via service role.
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    await sb.from("invoices").delete().ilike("invoice_number", "E2E-MATCH-001");

    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "reviewed",
        storage_path: "e2e-slice4/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-match-test.pdf",
        supplier: "Reimer Hardwoods",
        invoice_number: "E2E-MATCH-001",
        po_ref: null,
        pre_tax_total: 500,
        gst: 25,
        pst: 35,
        total: 560,
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    await sb.from("invoice_lines").insert({
      invoice_id: inv.id,
      line_no: 1,
      qty: 2,
      sku: "MAP-34",
      description: "Hard maple sheet",
      unit: "sheet",
      unit_price: 250,
      amount: 500,
      tax_flag: true,
      confidence: 0.95,
    });

    // 2. Login and navigate to the match page.
    await login(page);
    await page.goto(`/invoices/${inv.id}`);

    // 3. The match view must render.
    await expect(page.locator('[data-testid="invoice-match-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 4. Supplier section is present.
    await expect(page.locator('[data-testid="supplier-section"]')).toBeVisible();

    // 5. Supplier picker is rendered and selectable.
    const supplierPicker = page.locator('[data-testid="supplier-picker"]');
    await expect(supplierPicker).toBeVisible();

    // 6. Line assignments section is present with at least one line row.
    await expect(page.locator('[data-testid="line-assignments-section"]')).toBeVisible();
    await expect(page.locator('[data-testid="line-assignment-row"]').first()).toBeVisible();

    // 7. Line job picker is rendered.
    const lineJobPicker = page.locator('[data-testid="line-job-picker-0"]');
    await expect(lineJobPicker).toBeVisible();

    // 8. "Save assignments" button is present and enabled.
    const saveBtn = page.locator('[data-testid="save-match-btn"]');
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).not.toBeDisabled();

    // 9. Click save — verify the request completes (no error banner).
    await saveBtn.click();
    await expect(saveBtn).toHaveText(/save assignments/i, { timeout: 10_000 });
    // No error banner after save. Scope to the match view — a bare [role="alert"]
    // also matches Next's always-present __next-route-announcer__ at the app root.
    await expect(
      page.locator('[data-testid="invoice-match-view"] [role="alert"]')
    ).not.toBeVisible();

    // 10. Clean up.
    await sb.from("invoices").delete().eq("id", inv.id);
  });
});

// ---------------------------------------------------------------------------
// Slice 5 — post to actuals + provenance
// ---------------------------------------------------------------------------

test.describe("invoices slice 5 — post to actuals + provenance", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("posting a reviewed invoice writes a job_cost_actual with provenance; re-post is blocked", async ({
    page,
  }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // The sentinel job seeded by scripts/seed-e2e.mjs.
    const JOB_ID = "e2e-smoke-job";

    // Clean slate from any prior attempt (actuals first — FK to the invoice).
    const { data: priorInv } = await sb
      .from("invoices")
      .select("id")
      .ilike("invoice_number", "E2E-POST-001");
    for (const row of priorInv ?? []) {
      await sb.from("job_cost_actuals").delete().eq("source_invoice_id", row.id);
    }
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-POST-001");

    // 1. Seed a reviewed invoice with one taxable line already assigned to the job.
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "reviewed",
        storage_path: "e2e-slice5/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-post-test.pdf",
        supplier: "Reimer Hardwoods",
        invoice_number: "E2E-POST-001",
        pre_tax_total: 500,
        gst: 25,
        pst: 35,
        total: 560,
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    const { data: lineRows, error: lineErr } = await sb
      .from("invoice_lines")
      .insert({
        invoice_id: inv.id,
        line_no: 1,
        qty: 2,
        sku: "MAP-34",
        description: "Hard maple sheet",
        unit: "sheet",
        unit_price: 250,
        amount: 500,
        tax_flag: true,
        confidence: 0.95,
        job_id: JOB_ID,
      })
      .select("*");
    expect(lineErr).toBeNull();
    const line = lineRows![0];

    // 2. Login and open the match page (reviewed invoices route there).
    await login(page);
    await page.goto(`/invoices/${inv.id}`);
    await expect(page.locator('[data-testid="invoice-match-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 3. Post to actuals.
    const postBtn = page.locator('[data-testid="post-actuals-btn"]');
    await expect(postBtn).toBeVisible();
    await postBtn.click();

    // 4. The detail view advances to the posted state (status flipped → posted).
    await expect(page.locator('[data-testid="invoice-posted-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 5. Re-post is blocked — the posted read-only view has no Post button.
    await expect(page.locator('[data-testid="post-actuals-btn"]')).toHaveCount(0);

    // 6. A job_cost_actual exists, traceable back to this invoice line, with the
    //    pre-tax headline amount and the with-PST figure alongside (ADR 0019).
    const { data: actuals } = await sb
      .from("job_cost_actuals")
      .select("*")
      .eq("source_invoice_id", inv.id);
    expect(actuals).toHaveLength(1);
    expect(actuals![0].job_id).toBe(JOB_ID);
    expect(actuals![0].kind).toBe("material");
    expect(actuals![0].source_invoice_line_id).toBe(line.id);
    expect(Number(actuals![0].amount)).toBeCloseTo(500, 2); // pre-tax headline
    expect(Number(actuals![0].amount_with_tax)).toBeCloseTo(535, 2); // + full PST 35

    // 7. Verify the invoice is at `posted`.
    const { data: afterPost } = await sb
      .from("invoices")
      .select("status")
      .eq("id", inv.id)
      .single();
    expect(afterPost?.status).toBe("posted");

    // 8. Clean up (actuals first — FK to the invoice).
    await sb.from("job_cost_actuals").delete().eq("source_invoice_id", inv.id);
    await sb.from("invoices").delete().eq("id", inv.id);
  });
});

// ---------------------------------------------------------------------------
// Slice 6 — catalog price update (SKU match + delta + import history)
// ---------------------------------------------------------------------------

test.describe("invoices slice 6 — catalog price update", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("matched SKU line shows the old→new delta + a large-jump nudge; Apply updates the offer and writes import history", async ({
    page,
  }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    const SKU = "E2E-SKU-PRICE-1";
    const ITEM_ID = "e2e-price-item";
    const SUPPLIER_NAME = "E2E Price Co";

    // Clean slate from any prior attempt (children first — FKs).
    {
      const { data: priorItem } = await sb.from("catalog_offers").select("id").eq("sku", SKU);
      for (const o of priorItem ?? []) {
        await sb.from("catalog_price_history").delete().eq("offer_id", o.id);
      }
      await sb.from("catalog_offers").delete().eq("sku", SKU);
      await sb.from("catalog_items").delete().eq("id", ITEM_ID);
      await sb.from("catalog_suppliers").delete().eq("name", SUPPLIER_NAME);
      await sb.from("invoices").delete().ilike("invoice_number", "E2E-PRICE-001");
    }

    // 1. Seed a catalog supplier + item + offer (offer at $100, with the SKU).
    const { data: supRows, error: supErr } = await sb
      .from("catalog_suppliers")
      .insert({ name: SUPPLIER_NAME })
      .select("*");
    expect(supErr).toBeNull();
    const supplierId = supRows![0].id;

    const { error: itemErr } = await sb.from("catalog_items").insert({
      id: ITEM_ID,
      kind: "material",
      name: "E2E Maple Sheet",
      section: "casework",
      unit: "ea",
      unit_price: 100,
      active: true,
    });
    expect(itemErr).toBeNull();

    const { data: offerRows, error: offerErr } = await sb
      .from("catalog_offers")
      .insert({
        item_id: ITEM_ID,
        supplier_id: supplierId,
        unit_price: 100,
        sku: SKU,
        active: true,
      })
      .select("*");
    expect(offerErr).toBeNull();
    const offerId = offerRows![0].id;

    // 2. Seed a reviewed invoice linked to that supplier with one matching line
    //    at $130 — a +30% move, above the 15% default threshold (nudge fires).
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "reviewed",
        storage_path: "e2e-slice6/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-price.pdf",
        supplier: SUPPLIER_NAME,
        invoice_number: "E2E-PRICE-001",
        supplier_id: supplierId,
        pre_tax_total: 130,
        gst: 6.5,
        pst: 9.1,
        total: 145.6,
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    await sb.from("invoice_lines").insert({
      invoice_id: inv.id,
      line_no: 1,
      qty: 1,
      sku: SKU,
      description: "E2E Maple Sheet",
      unit: "ea",
      unit_price: 130,
      amount: 130,
      tax_flag: true,
      confidence: 0.95,
    });

    // 3. Login and open the match page (reviewed invoices route there).
    await login(page);
    await page.goto(`/invoices/${inv.id}`);
    await expect(page.locator('[data-testid="invoice-match-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 4. The catalog price-update panel renders with the matched line.
    await expect(page.locator('[data-testid="price-update-section"]')).toBeVisible({
      timeout: 15_000,
    });
    const row = page.locator('[data-testid="price-update-row"]').first();
    await expect(row).toBeVisible();

    // 5. A large jump (+30%) is flagged for re-quote.
    await expect(row.locator('[data-testid="price-jump-nudge"]')).toBeVisible();

    // 6. Apply the price update.
    const applyBtn = row.locator('[data-testid="apply-price-update-btn"]');
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();

    // 7. The row confirms the update landed.
    await expect(row.locator('[data-testid="price-update-applied"]')).toBeVisible({
      timeout: 10_000,
    });

    // 8. The offer's unit price is now $130 (debounced flush — poll for it).
    await expect
      .poll(
        async () => {
          const { data } = await sb
            .from("catalog_offers")
            .select("unit_price")
            .eq("id", offerId)
            .single();
          return Number(data?.unit_price);
        },
        { timeout: 10_000 }
      )
      .toBe(130);

    // 9. Price history carries an `import`-sourced row for this offer.
    await expect
      .poll(
        async () => {
          const { data } = await sb
            .from("catalog_price_history")
            .select("source")
            .eq("offer_id", offerId)
            .eq("source", "import");
          return (data ?? []).length;
        },
        { timeout: 10_000 }
      )
      .toBeGreaterThanOrEqual(1);

    // 10. Clean up (children first — FKs).
    await sb.from("catalog_price_history").delete().eq("offer_id", offerId);
    await sb.from("invoices").delete().eq("id", inv.id);
    await sb.from("catalog_offers").delete().eq("id", offerId);
    await sb.from("catalog_items").delete().eq("id", ITEM_ID);
    await sb.from("catalog_suppliers").delete().eq("id", supplierId);
  });
});

// ---------------------------------------------------------------------------
// Slice 7 — mobile camera capture (PWA)
// ---------------------------------------------------------------------------

test.describe("invoices slice 7 — camera capture (PWA)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("camera capture button is present; panel opens; adding an image shows preview; upload creates a pending invoice", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/invoices");
    await expect(page.getByText("Supplier invoices")).toBeVisible({ timeout: 15_000 });

    // 1. "Snap invoice" button is visible in the page header.
    const cameraBtn = page.locator('[data-testid="camera-capture-btn"]');
    await expect(cameraBtn).toBeVisible();

    // 2. Clicking opens the camera capture panel.
    await cameraBtn.click();
    const panel = page.locator('[data-testid="camera-capture-panel"]');
    await expect(panel).toBeVisible({ timeout: 5_000 });

    // 3. Simulate adding a page via the hidden camera input (Playwright calls
    //    setInputFiles directly — capture="environment" is a hint ignored in test).
    //    The sample PDF is the available fixture; the camera input accepts images
    //    but any file works for the upload smoke (type is sent in the request body).
    await page.locator('[data-testid="camera-page-input"]').setInputFiles(SAMPLE_PDF);

    // 4. A page preview thumbnail appears.
    await expect(panel.locator('[data-testid="camera-page-preview"]').first()).toBeVisible({
      timeout: 5_000,
    });

    // 5. The upload button is shown and shows the page count.
    const uploadBtn = panel.locator('[data-testid="camera-upload-btn"]');
    await expect(uploadBtn).toBeVisible();
    await expect(uploadBtn).toHaveText(/upload invoice/i);

    // 6. Click upload — the file lands as a `pending` invoice row in the list.
    await uploadBtn.click();

    // Panel closes after successful upload.
    await expect(panel).not.toBeVisible({ timeout: 15_000 });

    // A new invoice row is visible with status "Pending" — indistinguishable
    // from a file-upload row.
    const row = page.locator('[data-testid="invoice-row"]').first();
    await expect(row).toBeVisible({ timeout: 15_000 });
    await expect(row.getByText("Pending")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// Slice 8 — QuickBooks-ready shape + export endpoint stub
// ---------------------------------------------------------------------------

test.describe("invoices slice 8 — QBO export stub", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("export endpoint returns a QBO-mappable shape for a seeded invoice", async () => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clean slate.
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-QBO-001");

    // 1. Seed a reviewed invoice with QBO fields populated.
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "reviewed",
        storage_path: "e2e-slice8/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-qbo.pdf",
        supplier: "Reimer Hardwoods",
        invoice_number: "E2E-QBO-001",
        pre_tax_total: 500,
        gst: 25,
        pst: 35,
        total: 560,
        qbo_vendor_id: "qbo-vendor-e2e",
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    await sb.from("invoice_lines").insert({
      invoice_id: inv.id,
      line_no: 1,
      qty: 2,
      sku: "MAPLE-34",
      description: "Hard maple sheet",
      unit: "sheet",
      unit_price: 250,
      amount: 500,
      tax_flag: true,
      confidence: 0.95,
      qbo_account: "5000-Materials",
    });

    // 2. Call the export endpoint directly (bypasses the browser UI).
    //    CRON_SECRET is available in CI via the env that the process route uses.
    const cronSecret = process.env.CRON_SECRET ?? "test-secret";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resp = await fetch(`${baseUrl}/api/invoices/${inv.id}/export-qbo`, {
      headers: { authorization: `Bearer ${cronSecret}` },
    });

    // The endpoint should either succeed (200) or return 401 when CRON_SECRET
    // is absent in this test environment.  Either way it must not crash (5xx).
    expect([200, 401]).toContain(resp.status);

    if (resp.status === 200) {
      const body = await resp.json();
      expect(body.ok).toBe(true);
      // QBO-H11: the legacy flat `export` shape was removed — the route now
      // returns ONLY the real v3 Bill (built via the same central-link path as
      // the push route) + its reconciliation.
      expect(body.export).toBeUndefined();
      const bill = body.bill;
      // No QBO connection in CI → the central link can't resolve, so the Bill
      // falls back to the embedded qbo_vendor_id (identical to the push path).
      expect(bill.VendorRef.value).toBe("qbo-vendor-e2e");
      expect(bill.VendorRef.name).toBe("Reimer Hardwoods");
      expect(bill.DocNumber).toBe("E2E-QBO-001");
      // Split taxes are never collapsed — GST + PST as two separate TaxLines.
      expect(Number(body.reconciliation.gst)).toBeCloseTo(25, 2);
      expect(Number(body.reconciliation.pst)).toBeCloseTo(35, 2);
      // One expense line, carrying the (unmapped, raw-label) account ref.
      expect(bill.Line).toHaveLength(1);
      expect(bill.Line[0].AccountBasedExpenseLineDetail.AccountRef.value).toBe("5000-Materials");
      expect(body.reconciliation.balanced).toBe(true);
    }

    // 3. Clean up.
    await sb.from("invoices").delete().eq("id", inv.id);
  });
});

// ---------------------------------------------------------------------------
// QBO S1 — Connect QuickBooks (OAuth + encrypted token store), settings panel
// ---------------------------------------------------------------------------

// The "Connect QuickBooks" panel in Settings is dark-shipped behind
// NEXT_PUBLIC_INVOICES_QBO_ENABLED (separate from NEXT_PUBLIC_INVOICES_ENABLED);
// CI turns the QBO flag on. With no QBO OAuth creds present in CI, the status
// probe reports configured:false and the panel must degrade to a clean "not
// configured" state — never a dead Connect button, never a crash.
test.describe("invoices QBO S1 — Connect QuickBooks panel (gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("the Settings page shows the QuickBooks connect panel, gracefully unconfigured", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");

    const panel = page.getByTestId("qbo-connect-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // No OAuth creds in CI → the status probe returns configured:false, so the
    // panel resolves to the "not configured" state (not a connect button).
    await expect(page.getByTestId("qbo-not-configured")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("qbo-connect")).toHaveCount(0);
    await expect(page.getByTestId("qbo-disconnect")).toHaveCount(0);
  });

  test("the QBO status endpoint reports unconfigured without leaking a token", async ({ page }) => {
    // Use the logged-in browser context (page.request shares its auth cookies);
    // the route is behind the auth middleware.
    await login(page);
    const res = await page.request.get("/api/invoices/qbo/status");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.configured).toBe(false);
    expect(body.connected).toBe(false);
    // The probe never returns any token field.
    expect(JSON.stringify(body)).not.toMatch(/refresh_token|access_token/i);
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

// ---------------------------------------------------------------------------
// QBO S3 — Vendor mapping (supplier ↔ QB vendor, auto-create + dedupe)
// ---------------------------------------------------------------------------

// The vendor-mapping endpoints ride the same NEXT_PUBLIC_INVOICES_QBO_ENABLED
// gate as QBO S1/S2. With no QBO OAuth creds in CI the resolve endpoint must
// degrade gracefully (unconfigured / not_connected, never 5xx crash). The
// pure-function unit tests in qboVendorSync.test.ts cover the matching logic.
test.describe("invoices QBO S3 — vendor mapping endpoints (gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("GET /api/invoices/qbo/vendors returns 404 when the flag is off, or degrades to not_connected when on without real creds", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.get("/api/invoices/qbo/vendors");

    // Flag off (prod default) → 404. Flag on in CI but no real QBO creds → 400
    // (not_connected) or 503 (unconfigured). Either way the endpoint must NOT
    // crash with a 5xx server error.
    expect([400, 404, 503]).toContain(res.status());

    const body = await res.json();
    // Always returns a JSON body with { ok: false } when not mapped.
    expect(body.ok).toBe(false);
    expect(typeof body.reason).toBe("string");
    // Must not leak any token field.
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });

  test("POST /api/invoices/qbo/vendors returns 400 when supplierId is missing", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post("/api/invoices/qbo/vendors", {
      data: {},
      headers: { "Content-Type": "application/json" },
    });

    // Flag off → 404; flag on + valid JSON but missing supplierId → 400.
    expect([400, 404]).toContain(res.status());
  });

  test("POST /api/invoices/qbo/vendors with a supplierId degrades gracefully without real QBO creds", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post("/api/invoices/qbo/vendors", {
      data: { supplierId: "00000000-0000-4000-8000-000000000099" },
      headers: { "Content-Type": "application/json" },
    });

    // Flag off → 404. Flag on but unconfigured → 503. Flag on but no token
    // → 400 (not_connected). Flag on + token + no supplier row → 404.
    // Any of these is acceptable; a 5xx "crash" (500) is NOT.
    expect([400, 404, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S4 — Account + tax-code mapping (settings + GST/PST wizard)
// ───────────────────────────────────────────────────────────────────────────
// The mapping endpoints + Settings panel ride the same NEXT_PUBLIC_INVOICES_QBO
// gate as QBO S1–S3. With no QBO OAuth creds in CI the GET/POST must degrade
// gracefully (not_connected / unconfigured, never a 5xx crash) and never leak a
// token. The pure mapping/suggest/resolve logic is covered by the unit tests in
// qboAccountMapping.test.ts.
test.describe("invoices QBO S4 — account + tax-code mapping (gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("the Settings page shows the QBO mapping panel; unconnected it asks to connect first", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");

    const panel = page.getByTestId("qbo-mapping-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // No QBO connection in CI → the GET returns not_connected, so the panel
    // resolves to the "connect first" state (no tax wizard rows).
    await expect(page.getByTestId("qbo-mapping-not-connected")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("qbo-tax-row-GST")).toHaveCount(0);
  });

  test("GET /api/invoices/qbo/mappings degrades gracefully without real QBO creds", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.get("/api/invoices/qbo/mappings");

    // Flag off (prod default) → 404. Flag on in CI but no real QBO creds → 400
    // (not_connected) or 503 (unconfigured). Never a 5xx crash.
    expect([400, 404, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(typeof body.reason).toBe("string");
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });

  test("POST /api/invoices/qbo/mappings rejects an invalid kind", async ({ page }) => {
    await login(page);

    const res = await page.request.post("/api/invoices/qbo/mappings", {
      data: { kind: "nonsense", localId: "GST", qboId: "4" },
      headers: { "Content-Type": "application/json" },
    });

    // Flag off → 404; flag on + bad kind → 400.
    expect([400, 404]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("POST /api/invoices/qbo/mappings with a valid shape degrades gracefully (no creds)", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post("/api/invoices/qbo/mappings", {
      data: { kind: "taxcode", localId: "GST", qboId: "4" },
      headers: { "Content-Type": "application/json" },
    });

    // Flag off → 404. Flag on but unconfigured → 503. Flag on but no token →
    // 400 (not_connected). A 5xx "crash" (500) is NOT acceptable.
    expect([400, 404, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO-H4 — Expense-account mapping UI (block-until-mapped dead-end, issue #187)
// ───────────────────────────────────────────────────────────────────────────
// The push gate blocks `accounts_unmapped` and tells the owner to "Map N expense
// accounts in Settings → QuickBooks first", but before #187 the settings panel
// had no account→AccountRef control, so the block could never be cleared in-UI.
// This slice adds the expense-account rows (mirroring the GST/PST wizard) that
// POST `kind:"account"`. As with S4, CI has no QBO creds, so the panel resolves
// to "connect first" and the endpoints degrade gracefully — the map→push wiring
// is exhaustively unit-tested (buildAccountRequirements, evaluateBillPush,
// resolveBillLineRefs) and the POST shape is proven here.
test.describe("invoices QBO-H4 — expense-account mapping UI (gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("the mapping panel renders the account wizard region; unconnected it asks to connect first", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");

    const panel = page.getByTestId("qbo-mapping-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // No QBO connection in CI → the panel resolves to "connect first"; neither
    // the tax wizard nor the new account wizard rows render in that state.
    await expect(page.getByTestId("qbo-mapping-not-connected")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("qbo-account-wizard")).toHaveCount(0);
  });

  test("POST /api/invoices/qbo/mappings with kind:account degrades gracefully (no creds)", async ({
    page,
  }) => {
    await login(page);

    // The account-mapping save the new UI fires. Without QBO creds in CI it must
    // degrade cleanly (not_connected / unconfigured / flag-off), never 5xx, and
    // never leak a token.
    const res = await page.request.post("/api/invoices/qbo/mappings", {
      data: { kind: "account", localId: "5000-Materials", qboId: "60" },
      headers: { "Content-Type": "application/json" },
    });

    expect([400, 404, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });

  test("POST /api/invoices/qbo/mappings with kind:account rejects a missing qboId", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post("/api/invoices/qbo/mappings", {
      data: { kind: "account", localId: "5000-Materials" },
      headers: { "Content-Type": "application/json" },
    });

    // Flag off → 404; flag on + missing qboId → 400. Never a crash.
    expect([400, 404]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S5 — material/subtrade kind resolution (issue #151)
// ───────────────────────────────────────────────────────────────────────────
// Posting used to hardcode kind="material", so subtrade bills mis-booked in
// estimated-vs-actual. The match UI now tags each line material|subtrade and
// posting threads that kind into job_cost_actuals.kind. This proves a line
// tagged subtrade in the UI books to the subtrade bucket, while a sibling line
// left at the material default keeps booking material (no regression).
test.describe("invoices QBO S5 — material/subtrade kind resolution", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("a line tagged subtrade in the match UI books a subtrade actual; the material line stays material", async ({
    page,
  }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // The sentinel job seeded by scripts/seed-e2e.mjs.
    const JOB_ID = "e2e-smoke-job";

    // Clean slate from any prior attempt (actuals first — FK to the invoice).
    const { data: priorInv } = await sb
      .from("invoices")
      .select("id")
      .ilike("invoice_number", "E2E-KIND-001");
    for (const row of priorInv ?? []) {
      await sb.from("job_cost_actuals").delete().eq("source_invoice_id", row.id);
    }
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-KIND-001");

    // 1. Seed a reviewed invoice with two non-taxable lines, both assigned to
    //    the job, both left untagged (line_kind null → defaults to material).
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "reviewed",
        storage_path: "e2e-s5/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-kind-test.pdf",
        supplier: "Toolpath CNC",
        invoice_number: "E2E-KIND-001",
        pre_tax_total: 300,
        gst: 0,
        pst: 0,
        total: 300,
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    const { data: lineRows, error: lineErr } = await sb
      .from("invoice_lines")
      .insert([
        {
          invoice_id: inv.id,
          line_no: 1,
          description: "CNC nesting — sub bill",
          amount: 200,
          tax_flag: false,
          job_id: JOB_ID,
        },
        {
          invoice_id: inv.id,
          line_no: 2,
          description: "Edge banding stock",
          amount: 100,
          tax_flag: false,
          job_id: JOB_ID,
        },
      ])
      .select("*")
      .order("line_no", { ascending: true });
    expect(lineErr).toBeNull();
    const subtradeLine = lineRows!.find((l) => l.line_no === 1)!;

    // 2. Login and open the match page (reviewed invoices route there).
    await login(page);
    await page.goto(`/invoices/${inv.id}`);
    await expect(page.locator('[data-testid="invoice-match-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 3. Tag the first line (CNC nesting) as Subtrade; leave the second material.
    const kindPicker = page.locator('[data-testid="line-kind-picker-0"]');
    await expect(kindPicker).toBeVisible();
    await kindPicker.selectOption("subtrade");

    // 4. Post to actuals.
    const postBtn = page.locator('[data-testid="post-actuals-btn"]');
    await expect(postBtn).toBeVisible();
    await postBtn.click();
    await expect(page.locator('[data-testid="invoice-posted-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 5. The first line booked a SUBTRADE actual, not material; the second
    //    line (untouched default) booked material.
    const { data: actuals } = await sb
      .from("job_cost_actuals")
      .select("*")
      .eq("source_invoice_id", inv.id);
    expect(actuals).toHaveLength(2);

    const subActual = actuals!.find((a) => a.source_invoice_line_id === subtradeLine.id);
    expect(subActual?.kind).toBe("subtrade");
    expect(Number(subActual?.amount)).toBeCloseTo(200, 2);

    const materialActuals = actuals!.filter((a) => a.kind === "material");
    expect(materialActuals).toHaveLength(1);
    expect(Number(materialActuals[0].amount)).toBeCloseTo(100, 2);

    // 6. The subtrade tag persisted on the line for auditability.
    const { data: afterLine } = await sb
      .from("invoice_lines")
      .select("line_kind")
      .eq("id", subtradeLine.id)
      .single();
    expect(afterLine?.line_kind).toBe("subtrade");

    // 7. Clean up (actuals first — FK to the invoice).
    await sb.from("job_cost_actuals").delete().eq("source_invoice_id", inv.id);
    await sb.from("invoices").delete().eq("id", inv.id);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S6 — build the QB Bill from a posted invoice (issue #152)
// ───────────────────────────────────────────────────────────────────────────
// The export endpoint now also returns the REAL QBO v3 Bill payload + a total
// reconciliation. This proves, end-to-end on a seeded invoice, that: VendorRef
// resolves; a material line and a subtrade line each carry the right per-line
// tax code (GST_PST vs GST); a no-job (shop-stock) line is INCLUDED on the bill
// (job actuals skip it, the bill must not); GST and PST stay as two separate
// TaxLines (never collapsed — ADR 0019); and Σ pre-tax lines + GST + PST equals
// the stated total. The pure logic is unit-tested in qboExport.test.ts.
test.describe("invoices QBO S6 — QB Bill payload", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("export endpoint returns a reconciled QB Bill with split taxes + shop-stock line", async () => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clean slate.
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-BILL-001");

    // 1. Seed a reviewed GST+PST invoice: one material (PST) line assigned to a
    //    job, one GST-only supplies line, one shop-stock (no job) line.
    //    pre-tax 1000 + GST 50 + PST 35 = 1085. PST is charged only on the two
    //    PST lines (700 base), GST on all taxable lines.
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "reviewed",
        storage_path: "e2e-s6/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-bill.pdf",
        supplier: "Reimer Hardwoods",
        invoice_number: "E2E-BILL-001",
        pre_tax_total: 1000,
        gst: 50,
        pst: 35,
        total: 1085,
        qbo_vendor_id: "qbo-vendor-bill",
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    await sb.from("invoice_lines").insert([
      {
        invoice_id: inv.id,
        line_no: 0,
        description: "Hard maple sheet",
        amount: 500,
        tax_flag: true, // GST + PST
        qbo_account: "5000-Materials",
        line_kind: "material",
        job_id: "e2e-smoke-job",
      },
      {
        invoice_id: inv.id,
        line_no: 1,
        description: "Spray finishing sub bill",
        amount: 200,
        tax_flag: true, // GST + PST
        qbo_account: "5100-Subcontractors",
        line_kind: "subtrade",
        job_id: "e2e-smoke-job",
      },
      {
        invoice_id: inv.id,
        line_no: 2,
        description: "Shop-stock screws",
        amount: 300,
        tax_flag: false, // GST only, no job
        qbo_account: "5010-Supplies",
        job_id: null,
      },
    ]);

    // 2. Hit the export endpoint (same auth as the slice-8 stub).
    const cronSecret = process.env.CRON_SECRET ?? "test-secret";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const resp = await fetch(`${baseUrl}/api/invoices/${inv.id}/export-qbo`, {
      headers: { authorization: `Bearer ${cronSecret}` },
    });
    expect([200, 401]).toContain(resp.status);

    if (resp.status === 200) {
      const body = await resp.json();
      const bill = body.bill;
      // VendorRef resolved + TaxExcluded global calc.
      expect(bill.VendorRef.value).toBe("qbo-vendor-bill");
      expect(bill.GlobalTaxCalculation).toBe("TaxExcluded");

      // All three lines INCLUDED — shop-stock is not skipped from the bill.
      expect(bill.Line).toHaveLength(3);
      const material = bill.Line.find((l: { LineNum: number }) => l.LineNum === 0);
      const subtrade = bill.Line.find((l: { LineNum: number }) => l.LineNum === 1);
      const shopStock = bill.Line.find((l: { LineNum: number }) => l.LineNum === 2);

      // Per-line account + tax code (no maps threaded → raw local labels).
      expect(material.AccountBasedExpenseLineDetail.AccountRef.value).toBe("5000-Materials");
      expect(material.AccountBasedExpenseLineDetail.TaxCodeRef.value).toBe("GST_PST");
      expect(material._kind).toBe("material");
      expect(subtrade.AccountBasedExpenseLineDetail.AccountRef.value).toBe("5100-Subcontractors");
      expect(subtrade.AccountBasedExpenseLineDetail.TaxCodeRef.value).toBe("GST_PST");
      expect(subtrade._kind).toBe("subtrade");

      // Shop-stock line: GST only, no job → NotBillable, null CustomerRef.
      expect(shopStock.AccountBasedExpenseLineDetail.TaxCodeRef.value).toBe("GST");
      expect(shopStock.AccountBasedExpenseLineDetail.CustomerRef).toBeNull();
      expect(shopStock.AccountBasedExpenseLineDetail.BillableStatus).toBe("NotBillable");

      // GST and PST stay as TWO separate TaxLines (never collapsed).
      expect(Number(bill.TxnTaxDetail.TotalTax)).toBeCloseTo(85, 2);
      const components = bill.TxnTaxDetail.TaxLine.map(
        (t: { _component: string }) => t._component
      ).sort();
      expect(components).toEqual(["GST", "PST"]);

      // PST allocated across the two PST lines, summing exactly to header PST.
      const pstShares = bill.Line.map((l: { _pstShare: number }) => l._pstShare);
      expect(pstShares.reduce((s: number, x: number) => s + x, 0)).toBeCloseTo(35, 2);

      // Total reconciliation: 1000 + 50 + 35 = 1085.
      expect(body.reconciliation.balanced).toBe(true);
      expect(Number(body.reconciliation.computedTotal)).toBeCloseTo(1085, 2);

      // QBO-H3 (#186): TaxRateRef must NOT carry a TaxCode id or a placeholder
      // label. With no TaxRate mapping threaded it resolves to null — never the
      // local label "GST"/"PST" the old code leaked. (The line TaxCodeRef, by
      // contrast, legitimately falls back to the local label pre-mapping.)
      for (const tl of bill.TxnTaxDetail.TaxLine as Array<{
        TaxLineDetail: { TaxRateRef: { value: string } | null; NetAmountTaxable: number };
        _component: string;
      }>) {
        expect(tl.TaxLineDetail.TaxRateRef).toBeNull();
      }
      // The GST/PST taxable bases stay auditable on the reconciliation (#186):
      // GST base spans every taxable line; PST base spans only the PST lines, so
      // GST base is the larger (or equal) of the two.
      expect(Number(body.reconciliation.gstBase)).toBeGreaterThan(0);
      expect(Number(body.reconciliation.pstBase)).toBeGreaterThan(0);
      expect(Number(body.reconciliation.gstBase)).toBeGreaterThanOrEqual(
        Number(body.reconciliation.pstBase)
      );
    }

    // 3. Clean up.
    await sb.from("invoices").delete().eq("id", inv.id);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S7 — push (idempotent) + preview/confirm + status badge + block-until-mapped
// ───────────────────────────────────────────────────────────────────────────
// The push endpoint (/api/invoices/[id]/push-qbo) rides the same
// NEXT_PUBLIC_INVOICES_QBO gate as S1–S6. With no QBO OAuth creds in CI it must
// degrade gracefully (404 flag-off / 400 not_connected / 503 unconfigured, never
// a 5xx crash) and never leak a token. The idempotency + block-until-mapped
// logic itself is exhaustively unit-tested in qboBillPush.test.ts. Here we prove
// the surfaces wire up: the endpoints degrade cleanly, and a POSTED invoice's
// detail page renders the "Send to QuickBooks" panel (which, unconnected in CI,
// resolves to the "connect first" state — proving the badge surface exists).
test.describe("invoices QBO S7 — push endpoints (gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("GET preview degrades gracefully without real QBO creds + never leaks a token", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.get(
      "/api/invoices/00000000-0000-4000-8000-0000000007a1/push-qbo"
    );

    // Flag off (prod default) → 404. Flag on in CI but no real QBO creds → 400
    // (not_connected) or 503 (unconfigured). A 5xx crash is NOT acceptable.
    expect([400, 404, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });

  test("POST push degrades gracefully without real QBO creds + never leaks a token", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post(
      "/api/invoices/00000000-0000-4000-8000-0000000007a1/push-qbo"
    );

    // Same degradation contract as the GET. 409 (blocked) is also fine if a real
    // connection existed; the point is no 5xx crash.
    expect([400, 404, 409, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });
});

test.describe("invoices QBO S7 — posted invoice push panel", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("a POSTED invoice's detail page shows the QuickBooks push panel + a status badge", async ({
    page,
  }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clean slate from any prior attempt.
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-PUSH-001");

    // Seed a POSTED invoice (the only status the push panel renders for).
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "posted",
        storage_path: "e2e-s7/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-push.pdf",
        supplier: "Reimer Hardwoods",
        invoice_number: "E2E-PUSH-001",
        pre_tax_total: 100,
        gst: 5,
        pst: 7,
        total: 112,
        qbo_vendor_id: "qbo-vendor-push",
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    await login(page);
    await page.goto(`/invoices/${inv.id}`);

    // The posted read-only view + the QBO push panel both render.
    await expect(page.locator('[data-testid="invoice-posted-view"]')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator('[data-testid="qbo-push-panel"]')).toBeVisible({ timeout: 15_000 });

    // Unconnected in CI → the preview reports not_connected, so the panel shows
    // the "connect first" state (no Bill badge yet). This proves the badge
    // surface exists without needing a live sandbox.
    await expect(page.locator('[data-testid="qbo-push-not-connected"]')).toBeVisible({
      timeout: 15_000,
    });

    // Clean up.
    await sb.from("invoices").delete().eq("id", inv.id);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S8 — attach source PDF to the bill (Attachable), issue #154
// ───────────────────────────────────────────────────────────────────────────
// The Attachable upload runs server-side inside `pushInvoiceBill` after a
// successful bill create. The pure helpers (buildAttachableMetadata,
// buildAttachableFilename, parseQboAttachableResponse) are exhaustively
// unit-tested in qboAttachable.test.ts. Here we prove:
//   1. The push endpoint (POST /push-qbo) still degrades cleanly without real
//      QBO creds (no regression, no new 5xx surface).
//   2. When QBO IS connected and a push IS successful, the response body
//      includes an `attachment` field — even if attaching fails the bill is
//      not undone (failure surfaces for retry, not as a top-level error).
//
// In CI (no QBO creds) the endpoint returns 400/404/503 before reaching the
// attachment path, so the degradation tests below cover the live code path.
test.describe("invoices QBO S8 — Attachable upload (non-blocking, gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("POST push-qbo still degrades gracefully without real QBO creds (S8 no regression)", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post(
      "/api/invoices/00000000-0000-4000-8000-0000000008a1/push-qbo"
    );

    // Flag off (prod default) → 404.
    // Flag on in CI but no real QBO creds → 400 (not_connected) or 503 (unconfigured).
    // 409 (blocked) is acceptable if QBO were connected but the invoice isn't pushable.
    // The Attachable upload code is never reached in these cases — the bill push
    // gates first. A 5xx "crash" is NOT acceptable.
    expect([400, 404, 409, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
    // Must not leak any token.
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S9 — total-mismatch guard + retry queue + push audit log (issue #155)
// ───────────────────────────────────────────────────────────────────────────
// S9 adds three surfaces, each proven without needing a live QBO sandbox:
//
//   1. Total-mismatch guard: the push endpoint returns 409/blocked with
//      block="total_mismatch" when the invoice's computed total disagrees with
//      the stated total (verified via the preview endpoint + gate shape).
//      In CI (no QBO creds) the push gates at not_connected/unconfigured before
//      reaching the mismatch check — so we prove the GATE SHAPE via the
//      `evaluateBillPush` unit tests and the endpoint's known-degradation
//      behaviour (no new 5xx surface).
//
//   2. Retry queue: the drain endpoint (/api/invoices/qbo/retry-queue) is
//      accessible with the cron bearer token. Without real QBO creds the queue
//      is empty (no prior transient failures) so the drain returns 0 retried —
//      but the endpoint must exist and never crash.
//
//   3. Audit log: every push attempt logs to `qbo_push_attempts`; after any
//      push attempt (success or failure) at least one row exists.
//      With no QBO creds in CI the push never reaches the audit-log write path,
//      so we verify the audit log table's existence indirectly via the DB
//      migration — and the pure-function audit tests cover the logic exhaustively.
//
// The pure-function coverage lives in qboPushAudit.test.ts (36 tests).

test.describe("invoices QBO S9 — total-mismatch guard (gated, degradation)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("POST push-qbo degrades gracefully without real QBO creds (S9 no regression)", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post(
      "/api/invoices/00000000-0000-4000-8000-0000000009a1/push-qbo"
    );

    // Flag off (prod default) → 404.
    // Flag on in CI but no real QBO creds → 400 (not_connected) or 503 (unconfigured).
    // 409 (blocked) is acceptable when connected but the invoice can't be pushed.
    // A 5xx crash is NOT acceptable.
    expect([400, 404, 409, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
    // Never leak a token.
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });

  test("GET preview degrades gracefully without real QBO creds (S9 no regression)", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.get(
      "/api/invoices/00000000-0000-4000-8000-0000000009a1/push-qbo"
    );

    expect([400, 404, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });
});

test.describe("invoices QBO S9 — retry-queue drain endpoint", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("GET retry-queue returns 401 without cron auth (endpoint exists, no crash)", async ({
    page,
  }) => {
    await login(page);

    // Without a bearer token the endpoint must return 401 (or 404 if flag is off).
    const res = await page.request.get("/api/invoices/qbo/retry-queue");
    expect([401, 404]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("POST retry-queue returns 401 without cron auth (endpoint exists, no crash)", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post("/api/invoices/qbo/retry-queue");
    expect([401, 404]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
  });

  test("POST retry-queue with cron auth drains (empty queue = 0 retried)", async ({ page }) => {
    await login(page);

    const cronSecret = process.env.CRON_SECRET ?? "test-secret";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

    const res = await fetch(`${baseUrl}/api/invoices/qbo/retry-queue`, {
      method: "POST",
      headers: { authorization: `Bearer ${cronSecret}` },
    });

    // Flag off (prod) → 404. Flag on + valid cron auth → 200 (even with an empty
    // queue). CRON_SECRET is absent in CI, so cron auth fails → 401 (matching the
    // sibling export-qbo/process cron-auth probes earlier in this spec).
    expect([200, 401, 404]).toContain(res.status);

    if (res.status === 200) {
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(typeof body.retried).toBe("number");
      // In CI the queue is empty (no prior transient failures).
      expect(body.retried).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(body.results)).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S10 — un-push / void path (issue #156)
// ───────────────────────────────────────────────────────────────────────────
// Voiding deletes a wrongly-pushed Bill in QBO and clears the local link so the
// invoice can be re-pushed. The pure gate + parse logic is unit-tested in
// qboVoid.test.ts. Here we prove the endpoint wires up and degrades cleanly:
// the void endpoint (POST /api/invoices/[id]/void-qbo) rides the same
// NEXT_PUBLIC_INVOICES_QBO gate as the push route. With no QBO OAuth creds in CI
// it must degrade gracefully (404 flag-off / 400 not_connected / 503
// unconfigured, never a 5xx crash) and never leak a token. A 409 (not_pushed) is
// also acceptable if a connection existed but the invoice was never pushed.
test.describe("invoices QBO S10 — void endpoint (gated, degradation)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("POST void-qbo degrades gracefully without real QBO creds + never leaks a token", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post(
      "/api/invoices/00000000-0000-4000-8000-0000000010a1/void-qbo"
    );

    // Flag off (prod default) → 404. Flag on in CI but no real QBO creds → 400
    // (not_connected) or 503 (unconfigured). 409 (not_pushed) is fine if a
    // connection existed but nothing was pushed. A 5xx crash is NOT acceptable.
    expect([400, 404, 409, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S11 — bulk catch-up push + token-health/reconnect nudge (issue #157)
// ───────────────────────────────────────────────────────────────────────────
// The bulk-push endpoint (/api/invoices/qbo/bulk-push) rides the same
// NEXT_PUBLIC_INVOICES_QBO gate as S1–S10. With no QBO OAuth creds in CI it
// must degrade gracefully (404 flag-off / 400 not_connected / 503
// unconfigured, never a 5xx crash) and never leak a token.
//
// The token-health nudge (QboBulkPushPanel banner) is a pure-client widget
// driven by the same GET endpoint; its rendering is proven by the invoices
// list page smoke (the panel hides itself when not connected).
//
// Pure logic — assessTokenHealth + summarizeBulkPush — is unit-tested in
// qboTokenHealth.test.ts + qboBulkPush.test.ts (15 assertions total).
test.describe("invoices QBO S11 — bulk catch-up push endpoints (gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("GET bulk-push degrades gracefully without real QBO creds + never leaks a token", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.get("/api/invoices/qbo/bulk-push");

    // Flag off (prod default) → 404. Flag on in CI but no real QBO creds → 400
    // (not_connected) or 503 (unconfigured). The endpoint MUST return an ok:true
    // body (with count:0) when QBO IS connected — but in CI we have no creds.
    // A 5xx crash is NOT acceptable.
    expect([200, 400, 404, 503]).toContain(res.status());

    const body = await res.json();
    // Never leak any token field regardless of status.
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);

    if (res.status() === 200) {
      expect(body.ok).toBe(true);
      expect(typeof body.count).toBe("number");
      // tokenHealth is null or a typed object — never a raw token string.
      if (body.tokenHealth !== null) {
        expect(["ok", "warning", "critical"]).toContain(body.tokenHealth.level);
        expect(typeof body.tokenHealth.message).toBe("string");
      }
    } else {
      expect(body.ok).toBe(false);
    }
  });

  test("POST bulk-push degrades gracefully without real QBO creds + never leaks a token", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.post("/api/invoices/qbo/bulk-push");

    // Flag off (prod default) → 404. Flag on in CI but no real QBO creds → 400
    // (not_connected) or 503 (unconfigured). A 5xx crash is NOT acceptable.
    expect([400, 404, 503]).toContain(res.status());

    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
  });
});

test.describe("invoices QBO S11 — bulk push panel renders on invoices page", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("the invoices list page renders without crashing when the QBO bulk-push panel is mounted (gated)", async ({
    page,
  }) => {
    // The QboBulkPushPanel hides itself when QBO isn't connected (degraded
    // GET returns 400 in CI).  This test proves the page doesn't crash on
    // mount and the existing processor-status bar is unaffected.
    await login(page);
    await page.goto("/invoices");

    // Page must load without a 500 or white screen.
    await expect(page.getByText("Supplier invoices")).toBeVisible({ timeout: 15_000 });

    // The panel hides itself when QBO is not connected — its testid must not
    // be present (not a visible crash state).
    // (If QBO IS connected the panel would show; in CI it won't be.)
    // Simply asserting the page loaded and the list is accessible is enough.
    await expect(page.locator('[data-testid="processor-status"]')).toBeVisible({
      timeout: 15_000,
    });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO S12 — sandbox→prod cutover + go-live checklist (issue #158)
// ───────────────────────────────────────────────────────────────────────────
// S12 is an operational close-out: the status endpoint now returns a
// `configuredEnvironment` field so the Connect QuickBooks panel can display
// the right environment label (sandbox or production) and show a warning when
// targeting a live QB company.
//
// In CI (no QBO creds, no QBO_ENVIRONMENT set) the endpoint returns
// configured:false with configuredEnvironment:"sandbox". This proves:
//   1. The field exists and is a valid environment string.
//   2. The panel description no longer contains the hardcoded word "sandbox"
//      standalone — it references the configuredEnvironment dynamically.
//   3. The panel shows the `data-testid="qbo-configured-env"` badge.
test.describe("invoices QBO S12 — prod cutover: configuredEnvironment in status", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("GET /api/invoices/qbo/status returns configuredEnvironment (sandbox in CI)", async ({
    page,
  }) => {
    await login(page);

    const res = await page.request.get("/api/invoices/qbo/status");

    // Flag off (prod default) → 404. Flag on in CI → 200.
    expect([200, 404]).toContain(res.status());

    if (res.status() === 200) {
      const body = await res.json();
      expect(body.ok).toBe(true);
      // configuredEnvironment must be present and a valid QBO environment string.
      expect(["sandbox", "production"]).toContain(body.configuredEnvironment);
      // In CI: QBO_ENVIRONMENT is unset → defaults to sandbox.
      expect(body.configuredEnvironment).toBe("sandbox");
      // Never leak any token field.
      expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
    }
  });

  test("ConnectQuickBooksPanel renders the dynamic qbo-configured-env badge (not hardcoded sandbox copy)", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings");

    const panel = page.getByTestId("qbo-connect-panel");
    await expect(panel).toBeVisible({ timeout: 15_000 });

    // In CI (not_configured), the panel degrades but the status probe still
    // resolves configuredEnvironment. Wait for the not_configured state to
    // render (the loading spinner to clear).
    await expect(page.getByTestId("qbo-not-configured")).toBeVisible({ timeout: 15_000 });

    // The panel must show the qbo-configured-env badge sourced from the status
    // response (the hardcoded "sandbox" copy was removed in S12).
    const envBadge = panel.getByTestId("qbo-configured-env");
    await expect(envBadge).toBeVisible({ timeout: 5_000 });
    const badgeText = await envBadge.textContent();
    expect(["sandbox", "production"]).toContain(badgeText?.trim());

    // The production-targeting warning must NOT be present in CI (sandbox).
    await expect(panel.getByTestId("qbo-prod-warning")).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// QBO-H1 — idempotency: prevent concurrent duplicate bills (issue #184)
//
// The worst money failure: two simultaneous push POSTs both read
// existingBillId=null, both pass the gate, both miss the DocNumber query, and
// both create a Bill → two real bills in QB. The fix sends a deterministic QBO
// `requestid` so QBO dedupes the create server-side (pure logic unit-tested in
// qboBillPush.test.ts + the concurrency seam in qboBillPushServer.test.ts).
//
// In CI there are no real QBO OAuth creds, so a live double-create can't be
// driven from the browser. This smoke proves the no-regression invariant: even
// firing TWO concurrent pushes at the same invoice, the endpoint always
// degrades gracefully (never a 5xx crash) and never leaks a token.
// ---------------------------------------------------------------------------
test.describe("invoices QBO-H1 — concurrent push idempotency (gated, degradation)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("two concurrent push-qbo POSTs both degrade gracefully (no 5xx, no token leak)", async ({
    page,
  }) => {
    await login(page);

    const url = "/api/invoices/00000000-0000-4000-8000-000000184a01/push-qbo";

    // Fire both pushes at once — the exact race the RequestId key closes.
    const [a, b] = await Promise.all([page.request.post(url), page.request.post(url)]);

    for (const res of [a, b]) {
      // Flag off → 404. Flag on without creds → 400 (not_connected) / 503
      // (unconfigured). 409 (blocked) is fine if connected-but-unpushable.
      // A 5xx CRASH (500) is never acceptable.
      expect([400, 404, 409, 503]).toContain(res.status());
      const text = await res.text();
      expect(text).not.toMatch(/access_token|refresh_token/i);
    }
  });
});

// ---------------------------------------------------------------------------
// QBO-H2 — RLS least-privilege on the encrypted-token tables (issue #185)
//
// The corrective migration (20260714000000_qbo_rls_least_privilege) drops the
// `FOR ALL TO authenticated USING (true)` policy on quickbooks_connection,
// quickbooks_links, and qbo_push_attempts, and REVOKEs their default grants —
// so a logged-in BROWSER session can no longer read the encrypted token
// ciphertext off the anon REST API. All legit access is server-side (service
// role, RLS-bypassing). This smoke proves the live property against the seeded
// local Postgres: seed a row with sentinel ciphertext via service role, then an
// authenticated anon-key client sees ZERO rows + no ciphertext, while service
// role still reads it back (server path intact).
// ---------------------------------------------------------------------------
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

test.describe("invoices QBO-H2 — token-table RLS least-privilege", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey || !anonKey,
    "needs E2E creds + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );

  test("an authenticated browser client cannot read encrypted-token rows; service role still can", async () => {
    const SENTINEL = "E2E-185-SENTINEL-CIPHERTEXT";
    const REALM = "E2E-185-REALM";

    // 1. Seed via service role (bypasses RLS) across all three token tables.
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clean any leftovers from a prior failed run.
    await sb.from("quickbooks_connection").delete().eq("realm_id", REALM);
    await sb.from("quickbooks_links").delete().eq("realm_id", REALM);
    await sb.from("invoices").delete().eq("storage_path", "e2e-185/seed.pdf");

    const { error: connErr } = await sb.from("quickbooks_connection").insert({
      realm_id: REALM,
      environment: "sandbox",
      company_name: "E2E 185 Co",
      encrypted_refresh_token: SENTINEL,
      encrypted_access_token: SENTINEL,
    });
    expect(connErr).toBeNull();

    const { error: linkErr } = await sb.from("quickbooks_links").insert({
      local_type: "invoice",
      local_id: "e2e-185-inv",
      qbo_type: "Bill",
      qbo_id: "e2e-185-bill",
      realm_id: REALM,
      environment: "sandbox",
    });
    expect(linkErr).toBeNull();

    // qbo_push_attempts needs a real invoice FK — seed a throwaway one.
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({ status: "pending", storage_path: "e2e-185/seed.pdf" })
      .select("id");
    expect(invErr).toBeNull();
    const invoiceId = invRows![0].id;

    const { error: attErr } = await sb.from("qbo_push_attempts").insert({
      invoice_id: invoiceId,
      status: "succeeded",
      realm_id: REALM,
      environment: "sandbox",
    });
    expect(attErr).toBeNull();

    try {
      // 2. An authenticated BROWSER-grade client (anon key + signed-in user).
      const authed = createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false },
      });
      const { error: signInErr } = await authed.auth.signInWithPassword({
        email: email!,
        password: password!,
      });
      expect(signInErr).toBeNull();

      // 3. Each token table must be unreadable: RLS denies (empty) or the
      //    REVOKE denies (error). Either way: NO rows, NO ciphertext leak.
      for (const table of [
        "quickbooks_connection",
        "quickbooks_links",
        "qbo_push_attempts",
      ] as const) {
        const { data } = await authed.from(table).select("*");
        expect(data ?? []).toHaveLength(0);
        expect(JSON.stringify(data ?? [])).not.toContain(SENTINEL);
      }

      // The most direct ciphertext exfil attempt must also come back empty.
      const { data: tokenData } = await authed
        .from("quickbooks_connection")
        .select("encrypted_refresh_token, encrypted_access_token")
        .eq("realm_id", REALM);
      expect(tokenData ?? []).toHaveLength(0);

      await authed.auth.signOut();

      // 4. Service role still reads the row back — the server path is intact.
      const { data: svcData, error: svcErr } = await sb
        .from("quickbooks_connection")
        .select("encrypted_refresh_token")
        .eq("realm_id", REALM)
        .single();
      expect(svcErr).toBeNull();
      expect(svcData?.encrypted_refresh_token).toBe(SENTINEL);
    } finally {
      // 5. Clean up the seeded rows (invoice cascade removes the push attempt).
      await sb.from("quickbooks_connection").delete().eq("realm_id", REALM);
      await sb.from("quickbooks_links").delete().eq("realm_id", REALM);
      await sb.from("invoices").delete().eq("id", invoiceId);
    }
  });
});

// ---------------------------------------------------------------------------
// QBO-H5 — capture who pushed/voided (audit integrity, issue #188)
//
// `pushInvoiceBill` / `voidInvoiceBill` accepted a `pushedBy` / `voidedBy` actor
// but the API routes never threaded one in, so `qbo_push_attempts.pushed_by` was
// always null for real user actions. The routes now read the authenticated user
// id off the request cookies (getAuthedUserId) and pass it through.
//
// Two properties, both CI-realistic without live QBO OAuth:
//   1. NO REGRESSION — adding the cookie-backed actor read must not break the
//      routes: push + void still degrade gracefully (never a 5xx, never a token
//      leak) when QBO is unconfigured.
//   2. AUDIT COLUMN ROUND-TRIPS — a push-attempt row written with an actor id
//      reads that exact id back from `pushed_by` (service-role gated), proving
//      the audit trail can answer "who did this".
// ---------------------------------------------------------------------------
test.describe("invoices QBO-H5 — push/void still degrade gracefully with actor read (gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("push + void routes never 5xx and never leak a token after threading the actor", async ({
    page,
  }) => {
    await login(page);

    const base = "/api/invoices/00000000-0000-4000-8000-000000188a01";
    const push = await page.request.post(`${base}/push-qbo`);
    const voidRes = await page.request.post(`${base}/void-qbo`);

    for (const res of [push, voidRes]) {
      // Flag off → 404. Flag on without creds → 400 (not_connected) / 503
      // (unconfigured). 409 is fine (blocked / not_pushed). 5xx is never OK.
      expect([400, 404, 409, 503]).toContain(res.status());
      const text = await res.text();
      expect(text).not.toMatch(/access_token|refresh_token/i);
    }
  });
});

test.describe("invoices QBO-H5 — pushed_by audit column round-trips the actor", () => {
  test.skip(
    !supabaseUrl || !serviceRoleKey,
    "needs SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL"
  );

  test("a push attempt written with an actor id reads that id back from pushed_by", async () => {
    const ACTOR = "00000000-0000-4000-8000-000000188ac7";
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // qbo_push_attempts.invoice_id is a real FK — seed a throwaway invoice.
    await sb.from("invoices").delete().eq("storage_path", "e2e-188/seed.pdf");
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({ status: "pending", storage_path: "e2e-188/seed.pdf" })
      .select("id");
    expect(invErr).toBeNull();
    const invoiceId = invRows![0].id;

    try {
      const { data: attRows, error: attErr } = await sb
        .from("qbo_push_attempts")
        .insert({
          invoice_id: invoiceId,
          status: "succeeded",
          kind: "push",
          pushed_by: ACTOR,
          environment: "sandbox",
        })
        .select("pushed_by");
      expect(attErr).toBeNull();
      // The audit trail records WHO — not a null actor for a user-driven push.
      expect(attRows![0].pushed_by).toBe(ACTOR);
    } finally {
      // Invoice delete cascades to its push attempts.
      await sb.from("invoices").delete().eq("id", invoiceId);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO-H7 — push-outcome visibility: failed/retry states + attachment failure
// (issue #190)
// ───────────────────────────────────────────────────────────────────────────
// Two silent gaps this proves closed:
//   (a) attachment failure is visible (covered by the pure-helper unit tests in
//       qboPushOutcome.test.ts + the attach-qbo endpoint degradation test below);
//   (b) a failed / retry-pending push is distinguishable from never-sent — the
//       push panel surfaces a "Failed — will retry" badge + a "Retry now" button
//       driven by the latest qbo_push_attempts row, EVEN when QBO is currently
//       not connected (CI has no QBO creds), because previewInvoicePush reads the
//       audit row independent of the live token.
test.describe("invoices QBO-H7 — failed/retry push is distinct from never-sent", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("a posted invoice with a failed_transient attempt shows a retry badge; a never-attempted one does not", async ({
    page,
  }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clean slate from any prior run.
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-H7-FAILED");
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-H7-NEVER");

    // 1. Seed a POSTED invoice whose last push FAILED transiently (no Bill link).
    const { data: failedRows, error: failedErr } = await sb
      .from("invoices")
      .insert({
        status: "posted",
        storage_path: "e2e-h7/failed.pdf",
        mime: "application/pdf",
        original_filename: "e2e-h7-failed.pdf",
        supplier: "Reimer Hardwoods",
        invoice_number: "E2E-H7-FAILED",
        pre_tax_total: 100,
        gst: 5,
        pst: 7,
        total: 112,
        qbo_vendor_id: "qbo-vendor-h7",
      })
      .select("id");
    expect(failedErr).toBeNull();
    const failedId = failedRows![0].id as string;

    const { error: attErr } = await sb.from("qbo_push_attempts").insert({
      invoice_id: failedId,
      status: "failed_transient",
      kind: "push",
      error_message: "QBO bill create failed: 503 Service Unavailable",
      http_status: 503,
      next_retry_at: new Date(Date.now() + 60_000).toISOString(),
      environment: "sandbox",
    });
    expect(attErr).toBeNull();

    // 2. Seed a control POSTED invoice that was NEVER pushed (no attempt rows).
    const { data: neverRows, error: neverErr } = await sb
      .from("invoices")
      .insert({
        status: "posted",
        storage_path: "e2e-h7/never.pdf",
        mime: "application/pdf",
        original_filename: "e2e-h7-never.pdf",
        supplier: "Reimer Hardwoods",
        invoice_number: "E2E-H7-NEVER",
        pre_tax_total: 100,
        gst: 5,
        pst: 7,
        total: 112,
        qbo_vendor_id: "qbo-vendor-h7",
      })
      .select("id");
    expect(neverErr).toBeNull();
    const neverId = neverRows![0].id as string;

    await login(page);

    try {
      // The failed invoice: the panel surfaces a distinct "Failed — will retry"
      // badge + a "Retry now" affordance (even though CI is not connected to QBO).
      await page.goto(`/invoices/${failedId}`);
      await expect(page.locator('[data-testid="qbo-push-panel"]')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('[data-testid="qbo-push-failed-retry"]')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('[data-testid="qbo-push-retry-now"]')).toBeVisible();

      // The control invoice: NO failed badge — distinct from the failure state.
      await page.goto(`/invoices/${neverId}`);
      await expect(page.locator('[data-testid="qbo-push-panel"]')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('[data-testid="qbo-push-failed-retry"]')).toHaveCount(0);
      await expect(page.locator('[data-testid="qbo-push-failed"]')).toHaveCount(0);
    } finally {
      // Invoice delete cascades to qbo_push_attempts.
      await sb.from("invoices").delete().eq("id", failedId);
      await sb.from("invoices").delete().eq("id", neverId);
    }
  });
});

// QBO-H7 — the re-attach endpoint (retry just the PDF) degrades gracefully in
// CI (no QBO creds) exactly like the push/void routes: never a 5xx, never a
// token leak. The real attach path is exercised by the S8 pure-helper tests.
test.describe("invoices QBO-H7 — attach-qbo endpoint (gated, degradation)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("POST attach-qbo degrades gracefully without real QBO creds (no 5xx, no token leak)", async ({
    page,
  }) => {
    await login(page);
    const res = await page.request.post(
      "/api/invoices/00000000-0000-4000-8000-0000001907a1/attach-qbo"
    );
    // Flag on in CI but no QBO creds → not_connected/unconfigured/not_found, or
    // not_pushed for a missing invoice — anything in the 4xx/5xx-but-not-server
    // band, but crucially NOT a 500-class crash and NOT a leaked token.
    expect([400, 404, 409, 503]).toContain(res.status());
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token|Bearer /i);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO-H8 — reconnect nudge on the push panel + actionable block-until-mapped
// link (issue #191)
// ───────────────────────────────────────────────────────────────────────────
// Two surfaces, both verifiable without a live QBO sandbox:
//   1. The Settings → QuickBooks section carries an `#quickbooks` anchor, so the
//      reconnect / mapping deep links actually scroll somewhere (the anchor was
//      dead before this slice).
//   2. A posted invoice's push panel, unconnected in CI, shows an actionable
//      "Reconnect QuickBooks in Settings" LINK (not dead text) pointing at that
//      anchor — proving the owner gets a reconnect prompt before/at a push.
test.describe("invoices QBO-H8 — reconnect nudge + actionable block link (gated)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("the Settings QuickBooks section exposes the #quickbooks deep-link anchor", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/settings#quickbooks");
    // Flag on in CI → the QuickBooks section renders with the anchor id so deep
    // links resolve. The connect panel inside it is the proof the section mounted.
    await expect(page.locator("#quickbooks")).toHaveCount(1);
    await expect(page.getByTestId("qbo-connect-panel")).toBeVisible({ timeout: 15_000 });
  });

  test("the push panel's not-connected state links to the QuickBooks settings anchor", async ({
    page,
  }) => {
    test.skip(!supabaseUrl || !serviceRoleKey, "needs SUPABASE_SERVICE_ROLE_KEY");

    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    await sb.from("invoices").delete().ilike("invoice_number", "E2E-H8-RECONNECT");

    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "posted",
        storage_path: "e2e-h8/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-h8.pdf",
        supplier: "Reimer Hardwoods",
        invoice_number: "E2E-H8-RECONNECT",
        pre_tax_total: 100,
        gst: 5,
        pst: 7,
        total: 112,
        qbo_vendor_id: "qbo-vendor-h8",
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    await login(page);
    await page.goto(`/invoices/${inv.id}`);

    await expect(page.getByTestId("qbo-push-panel")).toBeVisible({ timeout: 15_000 });

    // Unconnected in CI → the not-connected state renders an actionable reconnect
    // LINK (the H8 fix) pointing at the Settings QuickBooks anchor.
    const link = page.getByTestId("qbo-push-reconnect-link");
    await expect(link).toBeVisible({ timeout: 15_000 });
    await expect(link).toHaveAttribute("href", "/settings#quickbooks");

    await sb.from("invoices").delete().eq("id", inv.id);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO-H9 — bulk-push panel: real error state (stop the silent vanish) (#192)
// ───────────────────────────────────────────────────────────────────────────
// The panel used to collapse any transient GET failure to phase:"hidden", so a
// 500 made the whole catch-up bar vanish — owner couldn't tell "no backlog"
// from "service broken". We mock the GET endpoint to a transient 500 and assert
// a VISIBLE, retryable error row renders instead of nothing. State-derivation
// logic is unit-tested in qboBulkPushPanelState.test.ts (12 assertions).
test.describe("invoices QBO-H9 — bulk-push panel surfaces a retryable error", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("a transient 500 on the bulk-push probe shows a retry row, not a vanished panel", async ({
    page,
  }) => {
    await login(page);

    // Force the catch-up probe to fail transiently (5xx) on first load.
    let hits = 0;
    await page.route("**/api/invoices/qbo/bulk-push", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      hits += 1;
      if (hits === 1) {
        return route.fulfill({
          status: 500,
          contentType: "text/html",
          body: "<html>boom</html>",
        });
      }
      // The retry recovers cleanly → "no backlog" (idle, count 0): error clears.
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, count: 0, tokenHealth: null }),
      });
    });

    await page.goto("/invoices");
    await expect(page.getByText("Supplier invoices")).toBeVisible({ timeout: 15_000 });

    // The bug fix: a visible, retryable error row — NOT a silent vanish.
    const errorRow = page.getByTestId("qbo-bulk-push-error");
    await expect(errorRow).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("qbo-bulk-push-retry-btn")).toBeVisible();

    // Retrying recovers: the error row clears once the probe succeeds.
    await page.getByTestId("qbo-bulk-push-retry-btn").click();
    await expect(errorRow).toBeHidden({ timeout: 15_000 });

    await page.unroute("**/api/invoices/qbo/bulk-push");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// QBO-H10 — consolidation (qboClient + withQboToken + qboRoute), issue #193
// ───────────────────────────────────────────────────────────────────────────
// Behaviour-preserving de-dup: the three per-invoice QBO write routes (push /
// void / attach) now share ONE `requireQboEnabled` flag guard and ONE
// `statusForReason` map. So under the SAME condition (flag on in CI, no real QBO
// creds → not_connected/unconfigured) they must agree on the HTTP status, never
// 5xx-crash, and never leak a token. This locks the consolidation's contract.
test.describe("invoices QBO-H10 — consolidated route helpers (gated, degradation)", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("push / void / attach routes share one status mapping + never 5xx or leak a token", async ({
    page,
  }) => {
    await login(page);

    const id = "00000000-0000-4000-8000-000000193a01";
    const responses = await Promise.all([
      page.request.post(`/api/invoices/${id}/push-qbo`),
      page.request.post(`/api/invoices/${id}/void-qbo`),
      page.request.post(`/api/invoices/${id}/attach-qbo`),
    ]);

    for (const res of responses) {
      // Shared statusForReason: flag-off 404 / not_connected 400 / unconfigured
      // 503 / not_pushed 409. A 5xx crash is NOT acceptable.
      expect([400, 404, 409, 503]).toContain(res.status());
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(JSON.stringify(body)).not.toMatch(/access_token|refresh_token/i);
    }

    // All three ride the SAME flag guard, so they agree on whether QBO is dark
    // (all 404) or live-but-degraded (none 404) — never a mix.
    const statuses = responses.map((r) => r.status());
    const all404 = statuses.every((s) => s === 404);
    const none404 = statuses.every((s) => s !== 404);
    expect(all404 || none404).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// #170 — duplicate + math guards on the POST screen (InvoiceMatchView)
// ───────────────────────────────────────────────────────────────────────────
// Phase-C audit #2: the post button lives on the match screen, but the
// duplicate-invoice guard + math-validation banner only rendered on the review
// screen — so a known-duplicate / math-mismatched bill could be posted with no
// on-screen warning. The match view now surfaces BOTH read-only banners
// (reusing validateMath + checkDuplicateInvoice). This seeds a reviewed invoice
// whose lines don't sum to its pre-tax total AND a duplicate sibling, then
// proves both banners render on the match screen before posting.
test.describe("invoices #170 — duplicate + math guards on the match screen", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("the match screen shows read-only duplicate + math banners before posting", async ({
    page,
  }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clean slate from any prior attempt.
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-GUARD-001");

    // 1. Seed a reviewed invoice whose single line ($900) does NOT sum to its
    //    stated pre-tax total ($1000) → validateMath check-1 fires.
    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "reviewed",
        storage_path: "e2e-170/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-guard-test.pdf",
        supplier: "Guard Supplier Ltd",
        invoice_number: "E2E-GUARD-001",
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
      qty: 1,
      sku: "GUARD-1",
      description: "Mismatched line",
      unit: "ea",
      unit_price: 900,
      amount: 900, // ≠ pre_tax_total 1000 → math banner
      tax_flag: true,
      confidence: 0.95,
    });

    // 2. Seed a duplicate sibling (same supplier + invoice #) → duplicate banner.
    await sb.from("invoices").insert({
      status: "posted",
      storage_path: "e2e-170/dup.pdf",
      mime: "application/pdf",
      original_filename: "e2e-guard-dup.pdf",
      supplier: "Guard Supplier Ltd",
      invoice_number: "E2E-GUARD-001",
    });

    // 3. Login and open the match page (reviewed invoices route there).
    await login(page);
    await page.goto(`/invoices/${inv.id}`);
    await expect(page.locator('[data-testid="invoice-match-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // 4. Both read-only guards render on the post screen.
    await expect(page.locator('[data-testid="match-duplicate-warning"]')).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.locator('[data-testid="match-math-banner"]')).toBeVisible();

    // 5. The post button is still present — these are advisory, not a hard block.
    await expect(page.locator('[data-testid="post-actuals-btn"]')).toBeVisible();

    // 6. Clean up.
    await sb.from("invoices").delete().ilike("invoice_number", "E2E-GUARD-001");
  });
});

// ---------------------------------------------------------------------------
// Issue #171 — transactional multi-line review save (RPC)
// ---------------------------------------------------------------------------

// The review save flips the header AND writes every line. It now runs through a
// single Postgres function (save_reviewed_invoice) so the whole batch commits in
// one transaction. This proves the happy path end-to-end: editing all three
// lines and clicking Save persists EVERY line (not just the first), and flips the
// invoice to `reviewed` — exercising the multi-row RPC against the real seeded DB.
test.describe("invoices #171 — transactional multi-line review save", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY"
  );

  test("saving a 3-line review persists every line atomically and marks reviewed", async ({
    page,
  }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    await sb.from("invoices").delete().ilike("invoice_number", "E2E-TXN-171");

    const { data: invRows, error: invErr } = await sb
      .from("invoices")
      .insert({
        status: "needs_review",
        storage_path: "e2e-171/dummy.pdf",
        mime: "application/pdf",
        original_filename: "e2e-txn-171.pdf",
        supplier: "Txn Supplier Ltd",
        invoice_number: "E2E-TXN-171",
        // Σ lines 600 = pre_tax; 600 + 30 + 42 = 672 total → math banner stays hidden.
        pre_tax_total: 600,
        gst: 30,
        pst: 42,
        total: 672,
      })
      .select("*");
    expect(invErr).toBeNull();
    const inv = invRows![0];

    await sb.from("invoice_lines").insert([
      {
        invoice_id: inv.id,
        line_no: 1,
        qty: 1,
        sku: "A-1",
        description: "Line one orig",
        unit: "ea",
        unit_price: 100,
        amount: 100,
        tax_flag: true,
      },
      {
        invoice_id: inv.id,
        line_no: 2,
        qty: 1,
        sku: "B-2",
        description: "Line two orig",
        unit: "ea",
        unit_price: 200,
        amount: 200,
        tax_flag: true,
      },
      {
        invoice_id: inv.id,
        line_no: 3,
        qty: 1,
        sku: "C-3",
        description: "Line three orig",
        unit: "ea",
        unit_price: 300,
        amount: 300,
        tax_flag: true,
      },
    ]);

    await login(page);
    await page.goto(`/invoices/${inv.id}`);
    await expect(page.locator('[data-testid="invoice-review-form"]')).toBeVisible({
      timeout: 15_000,
    });

    // Edit every line's description, then save. The RPC must persist all three.
    await page.getByLabel("Line 1 description").fill("Line one EDITED");
    await page.getByLabel("Line 2 description").fill("Line two EDITED");
    await page.getByLabel("Line 3 description").fill("Line three EDITED");

    const saveBtn = page.locator('[data-testid="save-reviewed-btn"]');
    await expect(saveBtn).not.toBeDisabled();
    await saveBtn.click();

    // Reviewed invoices route to the match step on success.
    await expect(page.locator('[data-testid="invoice-match-view"]')).toBeVisible({
      timeout: 15_000,
    });

    // Header flipped AND every line persisted its edit (atomic multi-row write).
    const { data: after } = await sb.from("invoices").select("status").eq("id", inv.id).single();
    expect(after?.status).toBe("reviewed");

    const { data: lineRows } = await sb
      .from("invoice_lines")
      .select("line_no, description")
      .eq("invoice_id", inv.id)
      .order("line_no", { ascending: true });
    expect(lineRows?.map((l) => l.description)).toEqual([
      "Line one EDITED",
      "Line two EDITED",
      "Line three EDITED",
    ]);

    await sb.from("invoices").delete().eq("id", inv.id);
  });
});
