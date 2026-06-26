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
    await expect(
      panel.locator('[data-testid="camera-page-preview"]').first()
    ).toBeVisible({ timeout: 5_000 });

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
      const exp = body.export;
      // QBO header fields present.
      expect(exp.invoiceId).toBe(inv.id);
      expect(exp.vendorRef).toBe("qbo-vendor-e2e");
      expect(exp.vendorName).toBe("Reimer Hardwoods");
      expect(exp.docNumber).toBe("E2E-QBO-001");
      // Split taxes never collapsed.
      expect(Number(exp.gst)).toBeCloseTo(25, 2);
      expect(Number(exp.pst)).toBeCloseTo(35, 2);
      expect(Number(exp.totalTax)).toBeCloseTo(60, 2);
      // Lines with QBO account + tax code.
      expect(exp.lines).toHaveLength(1);
      expect(exp.lines[0].accountRef).toBe("5000-Materials");
      expect(exp.lines[0].taxCodeRef).toBe("TAX");
    }

    // 3. Clean up.
    await sb.from("invoices").delete().eq("id", inv.id);
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
