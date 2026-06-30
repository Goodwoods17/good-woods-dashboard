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
// The seeded client-safe doc whose bytes the watermark route stamps (S4).
const SAFE_DOC_ID = "52d00000-0000-4000-8000-000000000001";

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

// Project Files & Sharing — S3 Email-the-link (issue #214).
//
// S3 adds a Resend-backed "Send email" button to each share-link row, with a
// graceful mailto fallback when RESEND_API_KEY is absent (always in CI). The
// test verifies:
//   1. The email input appears on each link row.
//   2. When Resend is unconfigured (CI), the route returns 503 and the UI opens
//      a mailto draft (we verify the send-note text appears, not the OS dialog).
//   3. Opt-in expiry and notification preference are present in the mint form.
// Needs the same seeded fixtures as S2 (same DEMO_JOB_ID + share tokens).
test.describe("project files S3 — email the link", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("email input is present on link rows, unconfigured path opens mailto", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    const section = page.getByTestId("document-share-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    // At least one active link row exists (seeded in S2 fixtures).
    const firstRow = section.getByTestId("document-share-link-row").first();
    await expect(firstRow).toBeVisible();

    // S3: the email input is rendered on the row.
    const emailInput = firstRow.getByTestId("document-share-email-input");
    await expect(emailInput).toBeVisible();

    // Fill a valid email and click Send.
    await emailInput.fill("smoke-test@goodwoods.local");
    const sendBtn = firstRow.getByTestId("document-share-send");
    await expect(sendBtn).toBeEnabled();
    await sendBtn.click();

    // CI has no RESEND_API_KEY → the API returns 503 "unconfigured". The UI
    // reacts by opening a mailto draft (we can't assert an OS dialog, but we
    // can assert the fallback note appears in the row).
    const note = firstRow.getByTestId("document-share-send-note");
    await expect(note).toBeVisible({ timeout: 8_000 });
  });

  test("opt-in expiry and notification preference controls are present in the mint form", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    const section = page.getByTestId("document-share-section");
    await expect(section).toBeVisible({ timeout: 15_000 });

    // S3: expiry date picker exists.
    await expect(section.getByTestId("document-share-expires")).toBeVisible();

    // S3: notification preference dropdown exists and has a "major" option.
    const notifySel = section.getByTestId("document-share-notify-pref");
    await expect(notifySel).toBeVisible();
    await expect(notifySel.locator("option[value='major']")).toHaveCount(1);
  });
});

// Project Files & Sharing — S4 Dynamic watermark on shared view (issue #215).
//
// The portal "Open" button routes through a per-doc watermark endpoint that
// stamps "{recipient} · {date} · Good Woods" into the RENDERED bytes (pdf-lib) on
// each request; the stored object is never mutated. scripts/seed-e2e.mjs uploads
// a real PDF for SAFE_DOC_ID whose own text does NOT contain the recipient name,
// so finding the recipient in the served bytes proves render-time injection.
test.describe("project files S4 — dynamic watermark on the shared view", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("the portal Open button points at the token-scoped watermark route", async ({ browser }) => {
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(`/d/${ACTIVE_TOKEN}`);
      await expect(guestPage.getByTestId("document-portal-view")).toBeVisible({ timeout: 15_000 });

      // The recipient watermark notice is shown.
      await expect(guestPage.getByTestId("portal-watermark-notice")).toBeVisible();

      // Open routes through the watermark endpoint (not a raw signed Storage URL).
      const href = await guestPage.getByTestId("portal-doc-open").getAttribute("href");
      expect(href).toBe(`/api/documents/portal/${ACTIVE_TOKEN}/file/${SAFE_DOC_ID}`);
    } finally {
      await guest.close();
    }
  });

  test("opening a drawing stamps the recipient watermark into the rendered bytes", async ({
    request,
  }) => {
    const res = await request.get(`/api/documents/portal/${ACTIVE_TOKEN}/file/${SAFE_DOC_ID}`);
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/pdf");
    expect(res.headers()["x-watermark"]).toBe("applied");

    const bytes = new Uint8Array(await res.body());

    // Extract the rendered text the way a viewer would — the recipient name must
    // appear (injected at render time), proving the stamp is in the bytes.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: bytes, useSystemFonts: true }).promise;
    let rendered = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      rendered += content.items.map((it) => ("str" in it ? it.str : "")).join(" ") + " ";
    }
    expect(rendered).toContain("E2E Test Client");
    expect(rendered).toContain("Good Woods");
  });

  test("a revoked token gets no bytes from the watermark route", async ({ request }) => {
    const res = await request.get(`/api/documents/portal/${REVOKED_TOKEN}/file/${SAFE_DOC_ID}`);
    expect(res.status()).toBe(410);
  });
});

// Project Files & Sharing — S6 Pinned spec / canonical current-set hero card (issue #218).
//
// The `CurrentSpecCard` appears at the top of the job OverviewTab showing every
// is_current document. Each row has a pin-toggle; clicking "Unpin" removes the doc
// from the set. The DocumentsCard list also shows a "Pin / Current" toggle on every
// row so staff can promote docs without leaving the page.
//
// The S2 seed marks all three demo documents `is_current=true` (the designer
// upload SAFE_DOC_ID, the CNC toolpath, and the Drive-link concept — each its own
// kind/label lineage), so the card renders three rows immediately on page load.
// Needs the same seeded Supabase + e2e user as S2.
test.describe("project files S6 — current spec hero card", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("the CurrentSpecCard renders at the top of the OverviewTab with seeded is_current docs", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // The hero card is present (S6 — the seed marks all three demo docs is_current).
    const card = page.getByTestId("current-spec-card");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // All three seeded is_current docs are shown, including the designer upload.
    await expect(card.getByTestId("spec-doc-row")).toHaveCount(3, { timeout: 10_000 });
    await expect(
      card.locator(`[data-testid="spec-doc-row"][data-doc-id="${SAFE_DOC_ID}"]`)
    ).toBeVisible();
  });

  test("the pin toggle in DocumentsCard changes the current-spec membership", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    const card = page.getByTestId("current-spec-card");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // Seed: all three demo docs are pinned. Scope to the designer upload row.
    await expect(card.getByTestId("spec-doc-row")).toHaveCount(3, { timeout: 10_000 });
    const safeRow = card.locator(`[data-testid="spec-doc-row"][data-doc-id="${SAFE_DOC_ID}"]`);
    await expect(safeRow).toBeVisible();

    // Unpin the designer upload — its row leaves the set (3 → 2); the others stay.
    await safeRow.getByTestId("spec-doc-unpin").click();
    await expect(safeRow).toHaveCount(0, { timeout: 5_000 });
    await expect(card.getByTestId("spec-doc-row")).toHaveCount(2, { timeout: 5_000 });

    // Re-pin via the DocumentsCard toggle. Use data-doc-id to pin exactly the
    // safe-doc back (S7 adds a superseded Rev A fixture that is also unpinned,
    // so we can no longer assume SAFE_DOC is the only unpinned doc in the list).
    const pinToggle = page.locator(
      `[data-testid="doc-pin-toggle"][data-pinned="false"][data-doc-id="${SAFE_DOC_ID}"]`
    );
    await expect(pinToggle).toBeVisible({ timeout: 5_000 });
    await pinToggle.click();

    // The designer upload row reappears (2 → 3), restoring the seeded state.
    await expect(safeRow).toHaveCount(1, { timeout: 5_000 });
    await expect(card.getByTestId("spec-doc-row")).toHaveCount(3, { timeout: 5_000 });
  });

  test("when the PROJECT_FILES flag is on, the spec-share-count reflects client-safe docs", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // PROJECT_FILES is enabled in e2e (CI sets NEXT_PUBLIC_PROJECT_FILES_ENABLED=true).
    const card = page.getByTestId("current-spec-card");
    await expect(card).toBeVisible({ timeout: 15_000 });

    // The seeded designer upload is is_current, uploaded (not link), and a client-safe kind.
    // So spec-share-count should read "1 will appear on a share link."
    const shareCount = card.getByTestId("spec-share-count");
    await expect(shareCount).toBeVisible();
    await expect(shareCount).toHaveText(/1 will appear on a share link/);
  });
});

// Project Files & Sharing — S7 Document revision / supersede UI (issue #219).
//
// Wires the `version`/`is_current`/`supersedes_id` fields into a first-class UI:
//   • A "Supersedes" picker in AddDocumentForm so Rev B can mark Rev A as
//     superseded when saved.
//   • A "SUPERSEDED" badge on non-current document rows in DocumentsCard.
//   • A Revision history panel in the detail pane when a doc belongs to a
//     multi-revision lineage.
//
// Seed: S7 adds a Rev A fixture (designer, is_current=false) with the same label
// as SAFE_DOC_ID (Rev B, is_current=true, supersedes_id=RevA). The seed is ordered
// so Rev A is inserted first (FK dep).
const S7_REVA_DOC_ID = "57000000-0000-4000-8000-000000000001";

test.describe("project files S7 — document revision / supersede UI", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("a superseded document shows the SUPERSEDED badge in the list", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // Rev A (is_current=false) is in the S7 seed. Find it by data-doc-id on the
    // SUPERSEDED badge — the badge is data-testid="doc-superseded-badge".
    // We locate the list item that contains the badge AND the Rev A doc row.
    await expect(
      page.locator(`[data-testid="doc-superseded-badge"]`).first()
    ).toBeVisible({ timeout: 15_000 });
  });

  test("Rev B (current) has a revision history panel showing both revisions", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // Click on SAFE_DOC_ID (Rev B) to load it into the detail pane.
    // The list row button targets the doc by clicking it.
    // We wait for the current-spec-card to confirm the page has loaded.
    const specCard = page.getByTestId("current-spec-card");
    await expect(specCard).toBeVisible({ timeout: 15_000 });

    // Locate and click the list row for SAFE_DOC_ID (Rev B).
    // The list items don't carry data-doc-id on the <li> itself but the
    // PinToggle does. We find the sibling button by looking for the pinToggle
    // adjacent to the <li> that contains it.
    // Simpler: click the pin-toggle row for SAFE_DOC to bring it into focus,
    // then look for the revision history panel.
    const revBRow = page.locator(`[data-testid="doc-pin-toggle"][data-doc-id="${SAFE_DOC_ID}"]`);
    // The list row button is a sibling — click the parent's first button (the row itself).
    const listItem = revBRow.locator("xpath=ancestor::li");
    await listItem.locator("button").first().click();

    // The revision history panel should now be visible in the detail pane.
    const historyPanel = page.getByTestId("doc-revision-history");
    await expect(historyPanel).toBeVisible({ timeout: 8_000 });

    // Both revisions appear as items: Rev A (superseded) + Rev B (current).
    await expect(historyPanel.getByTestId("doc-revision-item")).toHaveCount(2);

    // Rev A's item is marked superseded, Rev B's is marked current.
    const revAItem = historyPanel.locator(`[data-testid="doc-revision-item"][data-doc-id="${S7_REVA_DOC_ID}"]`);
    const revBItem = historyPanel.locator(`[data-testid="doc-revision-item"][data-doc-id="${SAFE_DOC_ID}"]`);
    await expect(revAItem).toBeVisible();
    await expect(revBItem).toBeVisible();
    await expect(revAItem).toHaveAttribute("data-is-current", "false");
    await expect(revBItem).toHaveAttribute("data-is-current", "true");
  });

  test("the supersedes select is present in the Add Document form when docs exist", async ({
    page,
  }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // Open the Add Document form.
    await page.getByRole("button", { name: /add document/i }).click();

    // The supersedes select appears when existingDocs are present.
    const supersededSelect = page.getByTestId("doc-supersedes-select");
    await expect(supersededSelect).toBeVisible({ timeout: 8_000 });

    // It has at least one named document option (the seeded docs).
    const options = supersededSelect.locator("option");
    // At least 2: the placeholder + one seeded doc.
    const count = await options.count();
    expect(count).toBeGreaterThan(1);
  });
});

// Project Files & Sharing — S10 Install photos gallery (issue #224).
//
// Activates the previously-disabled "Files" tab on the job detail page. Photos
// (kind:photo, source:upload) are stored in the existing `job-documents` bucket.
// Photos are displayed in a milestone-tagged before/after timeline; clicking a
// photo opens an issue-annotation lightbox.
//
// These tests exercise the tab navigation and UI shell without requiring
// Supabase storage — they verify the tab is enabled, the empty state renders,
// and the upload form (milestone + position pickers, upload button) is present.
// The full upload smoke (upload → tagged → appears in timeline) requires a
// seeded Supabase environment (same guards as other S* tests).
test.describe("project files S10 — install photos gallery", () => {
  // The "Files" tab navigation is always exercisable as long as we can log in.
  test.skip(
    !email || !password,
    "needs E2E_EMAIL / E2E_PASSWORD"
  );

  test("the Files tab is enabled and navigable on the job detail page", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // The Files tab must be present and clickable (no longer disabled).
    const filesTab = page.getByRole("button", { name: /^files$/i });
    await expect(filesTab).toBeVisible({ timeout: 15_000 });
    await expect(filesTab).not.toBeDisabled();

    // Clicking it loads the install photos tab.
    await filesTab.click();
    const photosTab = page.getByTestId("install-photos-tab");
    await expect(photosTab).toBeVisible({ timeout: 8_000 });
  });

  test("the empty state renders with an upload call-to-action", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    await page.getByRole("button", { name: /^files$/i }).click();

    // If no photos exist, the empty state shows; otherwise the timeline shows.
    // Either way, the "Add photo" button is present.
    const addBtn = page.getByTestId("photo-toggle-upload");
    await expect(addBtn).toBeVisible({ timeout: 8_000 });
  });

  test("the upload form shows milestone and position pickers", async ({ page }) => {
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    await page.getByRole("button", { name: /^files$/i }).click();
    await page.getByTestId("photo-toggle-upload").click();

    const uploadRow = page.getByTestId("photo-upload-row");
    await expect(uploadRow).toBeVisible({ timeout: 8_000 });

    // Milestone select with at least the Install option.
    const milestoneSelect = page.locator("#photo-milestone");
    await expect(milestoneSelect).toBeVisible();
    await expect(milestoneSelect.locator("option[value='install']")).toHaveCount(1);

    // Before and after position toggles.
    await expect(page.getByTestId("photo-position-before")).toBeVisible();
    await expect(page.getByTestId("photo-position-after")).toBeVisible();

    // Upload button is present.
    await expect(page.getByTestId("photo-upload-btn")).toBeVisible();
  });

  test("upload an install photo — tagged to milestone — appears in timeline", async ({ page }) => {
    test.skip(!supabaseUrl, "needs a seeded Supabase");

    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    await page.getByRole("button", { name: /^files$/i }).click();

    // Open the upload form.
    await page.getByTestId("photo-toggle-upload").click();
    await expect(page.getByTestId("photo-upload-row")).toBeVisible({ timeout: 8_000 });

    // Select "Install" + "After".
    await page.locator("#photo-milestone").selectOption("install");
    await page.getByTestId("photo-position-after").click();

    // Upload a tiny 1×1 white PNG via file-chooser.
    const [filechooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByTestId("photo-upload-btn").click(),
    ]);
    // 1×1 white PNG (67 bytes base64-decoded).
    const buffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwADhQGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );
    await filechooser.setFiles([{
      name: "smoke-install.png",
      mimeType: "image/png",
      buffer,
    }]);

    // After upload the form closes; the timeline should show the photo.
    const timeline = page.getByTestId("photos-timeline");
    await expect(timeline).toBeVisible({ timeout: 15_000 });

    // The uploaded photo thumb appears (data-doc-id not known, but a thumb exists).
    await expect(page.getByTestId("photo-thumb").first()).toBeVisible({ timeout: 10_000 });

    // The "After" position label is visible in the timeline.
    await expect(page.getByTestId("position-label-after")).toBeVisible();
  });
});
