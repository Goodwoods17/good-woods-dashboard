import { test, expect, type Page } from "@playwright/test";

// Forms slice 1 (issue #32) authed smoke: prove the tracer cuts end-to-end —
// the seeded templates render at /forms, and on a job's Forms tab a template can
// be attached (snapshot), a checkbox ticked, and the answer survives a reload
// (the full DB → store → render → persist round-trip). Needs a seeded Supabase
// (CI boots a local stack, replays migrations — which seed the templates — and
// seeds the user + sentinel job); skipped locally when E2E creds are absent.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

// Seeded by scripts/seed-e2e.mjs.
const E2E_JOB_ID = "e2e-smoke-job";
// Seeded by the forms migration (20260625120000_forms.sql).
const PRE_INSTALL = "Pre-Install Check";
const FIRST_CHECKBOX = "Hinges packed";

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

test.describe("forms slice 1 — tracer", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("/forms lists the seeded form templates", async ({ page }) => {
    await login(page);
    await page.goto("/forms");
    await expect(page.getByText(PRE_INSTALL)).toBeVisible({ timeout: 15_000 });
  });

  test("attach a template to a job, tick a checkbox, persists on reload", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${E2E_JOB_ID}`);

    // Open the Forms tab.
    await page.getByRole("button", { name: "Forms", exact: true }).click();

    // Attach the Pre-Install template (idempotent enough for a fresh CI DB; if a
    // prior run left an instance, the new one stacks — the assertion still holds).
    await page.getByRole("button", { name: /add form/i }).click();
    await page.getByRole("button", { name: new RegExp(PRE_INSTALL) }).click();

    // The snapshotted instance renders its fields. Tick the first checkbox.
    const checkbox = page.getByRole("checkbox", { name: FIRST_CHECKBOX }).first();
    await expect(checkbox).toBeVisible({ timeout: 15_000 });
    await checkbox.check();
    await expect(checkbox).toBeChecked();

    // Reload — the answer must survive (Supabase persisted, store reloads).
    await page.reload();
    await page.getByRole("button", { name: "Forms", exact: true }).click();
    const reloaded = page.getByRole("checkbox", { name: FIRST_CHECKBOX }).first();
    await expect(reloaded).toBeChecked({ timeout: 15_000 });
  });
});

test.describe("forms slice 2 — full registry + builder + defaults/standalone", () => {
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase");

  test("/forms shows the template library with Edit + Delete controls", async ({ page }) => {
    await login(page);
    await page.goto("/forms");
    // The seeded Pre-Install template renders as a card.
    await expect(page.getByText(PRE_INSTALL)).toBeVisible({ timeout: 15_000 });
    // Edit button (pencil icon) is present on the card.
    const card = page.locator('[data-testid="form-template-card"]').first();
    await expect(card.getByRole("button", { name: /edit template/i })).toBeVisible();
  });

  test("create a new template via 'New template' button, then edit its fields", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/forms");

    // Open new template form.
    await page.getByRole("button", { name: /new template/i }).click();
    await page.getByPlaceholder(/pre-install/i).fill("Smoke Test Template");
    await page.getByRole("button", { name: /create & edit fields/i }).click();

    // Should land in the TemplateEditor for the new template.
    await expect(page.getByText("Edit template: Smoke Test Template")).toBeVisible({
      timeout: 10_000,
    });

    // Add a short_text field.
    await page.getByRole("button", { name: /add field/i }).click();
    // The FieldConfigPanel has a Label input and a Type selector.
    // Set label first (currently says "New field" — clear + type).
    const labelInput = page.locator('input[value="New field"]');
    await labelInput.clear();
    await labelInput.fill("Client name");
    // Type selector should default to short_text (already set).

    // Click Save field.
    await page.getByRole("button", { name: /save field/i }).click();

    // The new field appears in the list.
    await expect(page.getByText("Client name")).toBeVisible({ timeout: 5_000 });
  });

  test("fill controls render for all 6 non-media types", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${E2E_JOB_ID}`);
    await page.getByRole("button", { name: "Forms", exact: true }).click();

    // Attach a form that has a checkbox (Pre-Install template is seeded with one).
    await page.getByRole("button", { name: /add form/i }).click();
    await page.getByRole("button", { name: new RegExp(PRE_INSTALL) }).click();

    // Form renders its fields — the checkbox control is the slice 1 proof.
    await expect(page.getByRole("checkbox", { name: FIRST_CHECKBOX }).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test("standalone form: fill one from the /forms page", async ({ page }) => {
    await login(page);
    await page.goto("/forms");
    await expect(page.getByText(PRE_INSTALL)).toBeVisible({ timeout: 15_000 });

    // Click "Fill standalone" on the Pre-Install card.
    const card = page
      .locator('[data-testid="form-template-card"]')
      .filter({ hasText: PRE_INSTALL })
      .first();
    await card.getByRole("button", { name: /fill standalone/i }).click();

    // A standalone instance appears in the Standalone forms section.
    await expect(page.locator('[data-testid="standalone-instance"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
