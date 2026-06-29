import { test, expect, type Page } from "@playwright/test";

// Project Files & Sharing — S2 document VIEW portal (issue #213).
//
// The no-login /d/<token> portal + the owner mint/list/revoke UI on the
// DocumentsCard are feature-flagged: they only render when
// NEXT_PUBLIC_PROJECT_FILES_ENABLED=true. CI sets that flag on for the e2e job;
// prod stays dormant until the owner flips it on.
//
// Needs a seeded Supabase (CI boots a local stack + replays migrations, incl.
// 20260715000000_share_tokens) + the e2e user. scripts/seed-e2e.mjs seeds three
// docs on the demo job (a client-safe designer upload, an internal toolpath_cnc
// upload, and a Drive-link doc) plus an active + a revoked document_view token.
// Skipped locally without creds.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

const DEMO_JOB_ID = "job-status-demo";
const ACTIVE_TOKEN = "e2edocviewactive00000000000000000000ab";
const REVOKED_TOKEN = "e2edocviewrevoked0000000000000000000cd";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  // Click, not Enter — Enter can submit before React state settles (gw-auth-and-rls).
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("link", { name: "Estimator" })).toBeVisible({ timeout: 15_000 });
}

test.describe("project files S2 — document view portal", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("the no-login portal shows the curated client-safe set and NEVER the internal kinds", async ({
    browser,
  }) => {
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(`/d/${ACTIVE_TOKEN}`);

      const view = guestPage.getByTestId("document-portal-view");
      await expect(view).toBeVisible({ timeout: 15_000 });
      await expect(guestPage.getByTestId("portal-job-name")).toHaveText("Job Status Demo");

      // The client-safe designer upload IS shown.
      const designer = guestPage.locator('[data-testid="portal-doc"][data-doc-kind="designer"]');
      await expect(designer).toHaveCount(1);

      // THE exposure gate: the internal toolpath_cnc doc is NOT exposed, and the
      // Drive-link doc (source:'link') is NOT exposed.
      await expect(
        guestPage.locator('[data-testid="portal-doc"][data-doc-kind="toolpath_cnc"]')
      ).toHaveCount(0);
      await expect(guestPage.getByText(/Designer concept \(Drive\)/)).toHaveCount(0);
      await expect(guestPage.getByText(/Cabinet bank toolpaths/)).toHaveCount(0);

      // Exactly the one curated doc renders.
      await expect(guestPage.getByTestId("portal-doc")).toHaveCount(1);

      // Who-to-call card is present (derived server-side, never client-supplied).
      await expect(guestPage.getByTestId("portal-contact")).toBeVisible();
    } finally {
      await guest.close();
    }
  });

  test("a revoked token kills access — clean inactive state, never data", async ({ browser }) => {
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(`/d/${REVOKED_TOKEN}`);
      await expect(guestPage.getByTestId("document-portal-inactive")).toBeVisible({
        timeout: 15_000,
      });
      await expect(guestPage.getByTestId("document-portal-view")).toHaveCount(0);
    } finally {
      await guest.close();
    }
  });

  test("an unknown token shows a clean inactive state, not data", async ({ browser }) => {
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto("/d/this-token-does-not-exist-000000000000000000");
      await expect(guestPage.getByTestId("document-portal-inactive")).toBeVisible({
        timeout: 15_000,
      });
    } finally {
      await guest.close();
    }
  });

  test("the owner DocumentsCard mints, lists, warns about Drive docs, and revokes", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    const section = page.getByTestId("document-share-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    // A seeded Drive-link doc → the mint-time warning is shown.
    await expect(section.getByTestId("document-share-drive-warning")).toBeVisible();

    // A seeded active link is already listed (list works).
    const rows = section.getByTestId("document-share-link-row");
    await expect(rows.first()).toBeVisible();
    const before = await rows.count();

    // Mint a fresh link → a new row appears.
    await section.getByTestId("document-share-mint").click();
    await expect(rows).toHaveCount(before + 1);

    // Revoke the first row → it drops out of the active list.
    await rows.first().getByTestId("document-share-revoke").click();
    await expect(rows).toHaveCount(before);
  });
});
