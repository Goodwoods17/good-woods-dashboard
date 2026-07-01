import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// The CI runner is Node 20, which ships no global WebSocket (supabase-js realtime).
(globalThis as { WebSocket?: unknown }).WebSocket ??= ws;

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
// Service-role key — only the S11 upload test needs it (to verify the created
// row + clean it up so the shared demo job's current-spec count stays pristine).
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Anon (publishable) key — the S14 belt-and-suspenders RLS test needs it to
// drive a real browser-grade anon REST client and prove the deny at runtime.
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const DEMO_JOB_ID = "job-status-demo";
const ACTIVE_TOKEN = "e2edocviewactive00000000000000000000ab";
const REVOKED_TOKEN = "e2edocviewrevoked0000000000000000000cd";
// The seeded client-safe doc whose bytes the watermark route stamps (S4).
const SAFE_DOC_ID = "52d00000-0000-4000-8000-000000000001";
// The seeded shop drawing the S12 approval-routing test routes + signs off.
const S12_DOC_ID = "51200000-0000-4000-8000-000000000001";

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

    // Revoke the first row. Revoke is now a two-tap arm/confirm: the first tap
    // arms the button (label changes to "Tap again to confirm"), the second tap
    // on the same row actually revokes and drops it from the active list.
    const revokeBtn = rows.first().getByTestId("document-share-revoke");
    await revokeBtn.click();
    await expect(revokeBtn).toHaveAttribute("data-armed", "true");
    await expect(revokeBtn).toHaveText(/Tap again to confirm/);
    await revokeBtn.click();
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
    // Security headers (#267): always nosniff; a watermarked pdf is safe inline.
    // A passthrough of a non-render-stampable stored mime is forced to attachment
    // (download) so a stored text/html can't execute same-origin.
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["content-disposition"]).toContain("inline");

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
    await expect(page.locator(`[data-testid="doc-superseded-badge"]`).first()).toBeVisible({
      timeout: 15_000,
    });
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
    const revAItem = historyPanel.locator(
      `[data-testid="doc-revision-item"][data-doc-id="${S7_REVA_DOC_ID}"]`
    );
    const revBItem = historyPanel.locator(
      `[data-testid="doc-revision-item"][data-doc-id="${SAFE_DOC_ID}"]`
    );
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
  test.skip(!email || !password, "needs E2E_EMAIL / E2E_PASSWORD");

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
    await filechooser.setFiles([
      {
        name: "smoke-install.png",
        mimeType: "image/png",
        buffer,
      },
    ]);

    // After upload the form closes; the timeline should show the photo.
    const timeline = page.getByTestId("photos-timeline");
    await expect(timeline).toBeVisible({ timeout: 15_000 });

    // The uploaded photo thumb appears (data-doc-id not known, but a thumb exists).
    await expect(page.getByTestId("photo-thumb").first()).toBeVisible({ timeout: 10_000 });

    // The "After" position label is visible in the timeline.
    await expect(page.getByTestId("position-label-after")).toBeVisible();
  });
});

// Project Files & Sharing — S11 designer UPLOAD portal / writing token (issue #225).
//
// The FIRST no-login WRITE capability link. A `document_request` token anchored
// on the demo job lets a token holder POST requested files straight into the job.
// Every security gate is server-side (service-role only, capability-type assert,
// revoked RE-check before the storage write, magic-byte MIME sniff, per-file size
// + per-token quota, server-generated path with upsert:false). The portal + write
// route are gated behind NEXT_PUBLIC_PROJECT_FILES_ENABLED (on in CI).
//
// scripts/seed-e2e.mjs seeds an ACTIVE + a REVOKED document_request token on the
// demo job, each with a "request these files" checklist.
const S11_REQUEST_TOKEN = "e2edocrequestactive00000000000000000ab";
const S11_REQUEST_REVOKED_TOKEN = "e2edocrequestrevoked000000000000000cd";

// A minimal real PDF (its %PDF header is what the server's magic-byte sniff reads).
const PDF_BYTES = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n", "utf8");
// A spoof: bytes are a Windows executable ("MZ"), but it will be sent labelled
// image/png — the server must reject it on the SNIFF, not the client mime.
const SPOOF_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);

test.describe("project files S11 — designer upload portal (writing token)", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("the no-login upload portal shows the request checklist + outstanding status", async ({
    browser,
  }) => {
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(`/d/${S11_REQUEST_TOKEN}`);

      const view = guestPage.getByTestId("document-request-portal-view");
      await expect(view).toBeVisible({ timeout: 15_000 });
      await expect(guestPage.getByTestId("portal-job-name")).toHaveText("Job Status Demo");

      // The seeded two-item checklist renders.
      await expect(guestPage.getByTestId("request-checklist-item")).toHaveCount(2);

      // The upload form + file input are present.
      await expect(guestPage.getByTestId("request-upload-form")).toBeVisible();
      await expect(guestPage.getByTestId("request-file-input")).toBeVisible();
    } finally {
      await guest.close();
    }
  });

  test("a revoked write-token is rejected — no bytes are accepted", async ({ request }) => {
    const res = await request.post(`/api/documents/portal/${S11_REQUEST_REVOKED_TOKEN}/upload`, {
      multipart: {
        file: { name: "drawing.pdf", mimeType: "application/pdf", buffer: PDF_BYTES },
      },
    });
    expect(res.status()).toBe(410);
  });

  test("an unknown write-token is rejected (404)", async ({ request }) => {
    const res = await request.post(
      `/api/documents/portal/this-token-does-not-exist-000000000000000000/upload`,
      {
        multipart: {
          file: { name: "drawing.pdf", mimeType: "application/pdf", buffer: PDF_BYTES },
        },
      }
    );
    expect(res.status()).toBe(404);
  });

  test("a spoofed-MIME upload is rejected on the magic-byte sniff (415)", async ({ request }) => {
    const res = await request.post(`/api/documents/portal/${S11_REQUEST_TOKEN}/upload`, {
      multipart: {
        // Client LIES: claims image/png, but the bytes are an MZ executable.
        file: { name: "innocent.png", mimeType: "image/png", buffer: SPOOF_BYTES },
      },
    });
    expect(res.status()).toBe(415);
  });

  test("an oversized upload is rejected (413)", async ({ request }) => {
    // 26 MiB — over the 25 MiB per-file ceiling. PDF header so it passes the sniff
    // gate IF it ever reached it; it must be rejected on size first.
    const big = Buffer.alloc(26 * 1024 * 1024);
    big.set([0x25, 0x50, 0x44, 0x46], 0); // %PDF
    const res = await request.post(`/api/documents/portal/${S11_REQUEST_TOKEN}/upload`, {
      multipart: {
        file: { name: "huge.pdf", mimeType: "application/pdf", buffer: big },
      },
    });
    expect(res.status()).toBe(413);
  });

  test("a valid upload is accepted, lands as a document on the job, and path-traversal in the filename is neutralised", async ({
    request,
  }) => {
    test.skip(!serviceRoleKey, "needs SUPABASE_SERVICE_ROLE_KEY to verify + clean up");
    const sb = createClient(supabaseUrl!, serviceRoleKey!);

    // A path-traversal attempt in the CLIENT filename — the server builds the
    // storage path itself from the token's job id, so this can never escape.
    const res = await request.post(`/api/documents/portal/${S11_REQUEST_TOKEN}/upload`, {
      multipart: {
        file: { name: "../../../etc/passwd.pdf", mimeType: "application/pdf", buffer: PDF_BYTES },
        requestIndex: "0",
      },
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      submissionId: string;
      documentId: string;
      filename: string;
      status: string;
    };
    expect(body.ok).toBe(true);
    expect(body.submissionId).toBeTruthy();
    expect(body.documentId).toBeTruthy();
    // The display filename was sanitised — no path separators survive.
    expect(body.filename).not.toContain("/");
    expect(body.filename).not.toContain("..");
    // Checklist advanced off "none" now that an item is satisfied.
    expect(["partial", "complete"]).toContain(body.status);

    // The document row exists on the demo job, server-pathed (no traversal).
    const { data: docRow } = await sb
      .from("documents")
      .select("id, project_id, kind, source, storage_path")
      .eq("id", body.documentId)
      .maybeSingle();
    expect(docRow).toBeTruthy();
    const doc = docRow as {
      project_id: string;
      kind: string;
      source: string;
      storage_path: string;
    };
    expect(doc.project_id).toBe(DEMO_JOB_ID);
    expect(doc.source).toBe("upload");
    expect(doc.storage_path.startsWith(`${DEMO_JOB_ID}/`)).toBe(true);
    expect(doc.storage_path).not.toContain("..");

    // #268: the append RPC actually PERSISTED the submission to the token state.
    // The HTTP response builds its checklist from an OPTIMISTIC local array, so
    // re-read the DB to prove the atomic append landed — a broken/absent RPC would
    // leave state.submissions empty here.
    const { data: tokRow } = await sb
      .from("share_tokens")
      .select("state")
      .eq("token", S11_REQUEST_TOKEN)
      .maybeSingle();
    const persisted =
      (tokRow?.state as { submissions?: Array<{ id?: string }> } | null)?.submissions ?? [];
    expect(persisted.some((s) => s.id === body.submissionId)).toBe(true);

    // ── Clean up so the shared demo job's current-spec count is left pristine
    //    (the uploaded doc is is_current designer → would otherwise inflate S6).
    await sb.storage.from("job-documents").remove([doc.storage_path]);
    await sb.from("documents").delete().eq("id", body.documentId);
    await sb
      .from("share_tokens")
      .update({ state: { requestedFiles: ["Sink elevation", "Hinge schedule"], submissions: [] } })
      .eq("token", S11_REQUEST_TOKEN);
  });
});

// Project Files & Sharing — S12 parallel approval routing (issue #226).
//
// A shop drawing is routed to architect + GC + PM AT ONCE; each leaves a status;
// the doc only reads "Approved" once ALL three sign off. The owner panel +
// `document_approvals` table are feature-flagged behind
// NEXT_PUBLIC_PROJECT_FILES_ENABLED (on in CI, dormant in prod). The seed plants
// a dedicated shop drawing (S12_DOC_ID, is_current=false so it stays out of the
// S6 current-spec counts) with NO approval slots; this test resets the slots
// (service role) so it's deterministic on retry, then drives the full
// route → partial-approve → fully-approve flow proving the parallel gate.
test.describe("project files S12 — parallel approval routing", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("routes to 3 reviewers and reaches Approved only after ALL sign off", async ({ page }) => {
    test.skip(!serviceRoleKey, "needs SUPABASE_SERVICE_ROLE_KEY to reset slots deterministically");
    const sb = createClient(supabaseUrl!, serviceRoleKey!);
    // Reset to un-routed so the flow starts from a known empty state on retry.
    await sb.from("document_approvals").delete().eq("document_id", S12_DOC_ID);

    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // Select the seeded shop drawing so its detail pane (with the routing panel)
    // renders.
    const row = page.locator(`[data-testid="doc-list-row"][data-doc-id="${S12_DOC_ID}"]`);
    await expect(row).toBeVisible({ timeout: 15_000 });
    await row.click();

    const panel = page.getByTestId("document-approval-panel");
    await expect(panel).toBeVisible({ timeout: 10_000 });

    // Un-routed → the route button is shown. Click it to notify all 3 at once.
    await panel.getByTestId("approval-route-btn").click();

    // Three reviewer slots appear, all pending.
    const rows = panel.getByTestId("approval-reviewer-row");
    await expect(rows).toHaveCount(3, { timeout: 10_000 });

    const overall = panel.getByTestId("approval-overall-status");
    await expect(overall).toHaveAttribute("data-status", "pending");

    const architect = panel.locator('[data-testid="approval-reviewer-row"][data-role="architect"]');
    const gc = panel.locator('[data-testid="approval-reviewer-row"][data-role="gc"]');
    const pm = panel.locator('[data-testid="approval-reviewer-row"][data-role="pm"]');

    // Approve architect → that slot flips, but the DOC is still pending (gate).
    await architect.getByTestId("approval-approve").click();
    await expect(architect).toHaveAttribute("data-status", "approved");
    await expect(overall).toHaveAttribute("data-status", "pending");

    // Approve GC → still pending; PM hasn't signed off.
    await gc.getByTestId("approval-approve").click();
    await expect(gc).toHaveAttribute("data-status", "approved");
    await expect(overall).toHaveAttribute("data-status", "pending");

    // Approve PM → now ALL three are in; the doc finally reads Approved.
    await pm.getByTestId("approval-approve").click();
    await expect(pm).toHaveAttribute("data-status", "approved");
    await expect(overall).toHaveAttribute("data-status", "approved", { timeout: 10_000 });

    // A single "needs revision" routes the doc back regardless of the others.
    await gc.getByTestId("approval-reject").click();
    await expect(gc).toHaveAttribute("data-status", "needs_revision");
    await expect(overall).toHaveAttribute("data-status", "needs_revision");

    // Clean up so the demo job's routing is left empty for the next run, and
    // remove the approval-request drafts this routing enqueued onto the shared
    // notification queue (they're pending_approval, so they never counted toward
    // any send budget, but leaving the DB pristine avoids surprises).
    await sb.from("document_approvals").delete().eq("document_id", S12_DOC_ID);
    await sb
      .from("scheduling_notifications")
      .delete()
      .eq("job_id", DEMO_JOB_ID)
      .eq("kind", "approval_request");
  });
});

// Project Files & Sharing — S13 branded portal domain + PortalBrand (issue #227).
//
// Smoke: the shared PortalBrand header is visible on the document view portal.
// The branded domain itself (files.goodwoods.com) is a Vercel dashboard alias —
// not testable in the local CI runner — but the PortalBrand component that
// provides anti-phishing legitimacy IS rendered by the existing seeded token and
// IS verifiable here. Also verifies that the inactive state carries the brand
// (a revoked token shows the brand bar, not a blank chrome page).
test.describe("project files S13 — branded portal header", () => {
  test.skip(
    !email || !password || !supabaseUrl,
    "needs E2E_EMAIL / E2E_PASSWORD + a seeded Supabase"
  );

  test("the PortalBrand header is visible on the document view portal", async ({ browser }) => {
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(`/d/${ACTIVE_TOKEN}`);

      // The branded header MUST appear before the job content (legitimacy anchor).
      const brand = guestPage.getByTestId("portal-brand");
      await expect(brand).toBeVisible({ timeout: 15_000 });

      // "Good Woods" wordmark is present inside the brand bar.
      await expect(brand.getByText("Good Woods")).toBeVisible();

      // The document portal view still renders correctly alongside the brand.
      await expect(guestPage.getByTestId("document-portal-view")).toBeVisible({
        timeout: 10_000,
      });

      // REGRESSION: the /d portal must render CHROMELESS — an anonymous share-link
      // recipient must NOT see the internal app shell (sidebar nav to Pipeline,
      // Invoices, P&L, CRM…). AppShell derives its chromeless set from
      // isPortalPath (portalDomain.ts) — this asserts the real render wiring, so a
      // future portal prefix that's added there is automatically covered here.
      await expect(guestPage.getByTestId("app-chrome")).toHaveCount(0);
    } finally {
      await guest.close();
    }
  });

  test("the PortalBrand header appears on an inactive (revoked) portal page", async ({
    browser,
  }) => {
    const guest = await browser.newContext();
    try {
      const guestPage = await guest.newPage();
      await guestPage.goto(`/d/${REVOKED_TOKEN}`);

      // Even a revoked/inactive state should carry the brand so the recipient
      // knows the link came from Good Woods (not a phishing page).
      const brand = guestPage.getByTestId("portal-brand");
      await expect(brand).toBeVisible({ timeout: 15_000 });
      await expect(guestPage.getByTestId("document-portal-inactive")).toBeVisible({
        timeout: 10_000,
      });
    } finally {
      await guest.close();
    }
  });
});

// ---------------------------------------------------------------------------
// S14 (issue #228) — RLS belt-and-suspenders on the default-deny tables.
//
// document_annotations / job_pieces / job_blockers previously relied on RLS
// default-deny for the anon role (no explicit anon policy). Migration
// 20260722000000 adds an explicit `*_anon_none` deny policy. This smoke proves
// the runtime property against the seeded local Postgres: seed a sentinel row
// in each table via service role (RLS-bypassing), then an UNAUTHENTICATED
// anon-key client sees ZERO rows (deny), while service role still reads it back
// (the legitimate server path is intact, no regression).
// ---------------------------------------------------------------------------
test.describe("project files S14 — anon-deny belt-and-suspenders RLS", () => {
  test.skip(
    !supabaseUrl || !serviceRoleKey || !anonKey,
    "needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_ANON_KEY"
  );

  test("an anonymous browser client reads ZERO rows from the default-deny tables; service role still can", async () => {
    const SENTINEL = "e2e-228-sentinel";

    const sb = createClient(supabaseUrl!, serviceRoleKey!, {
      auth: { persistSession: false },
    });

    // Clean any leftovers from a prior failed run.
    await sb.from("document_annotations").delete().eq("document_id", SENTINEL);
    await sb.from("job_pieces").delete().eq("project_id", SENTINEL);
    await sb.from("job_blockers").delete().eq("reason", SENTINEL);

    // 1. Seed one sentinel row per table via service role (bypasses RLS).
    const { error: annErr } = await sb.from("document_annotations").insert({
      document_id: SENTINEL,
      project_id: SENTINEL,
      type: "ink",
      data: { sentinel: true },
      color: "#000000",
    });
    expect(annErr).toBeNull();

    const { error: pieceErr } = await sb.from("job_pieces").insert({
      project_id: SENTINEL,
      kind: "cabinet",
      label: "S14 sentinel piece",
    });
    expect(pieceErr).toBeNull();

    // job_blockers.job_id FKs jobs(id); reuse the seeded demo job.
    const { error: blockerErr } = await sb.from("job_blockers").insert({
      job_id: DEMO_JOB_ID,
      reason: SENTINEL,
    });
    expect(blockerErr).toBeNull();

    try {
      // 2. An UNAUTHENTICATED browser-grade client (anon key, never signed in).
      const anon = createClient(supabaseUrl!, anonKey!, {
        auth: { persistSession: false },
      });

      // 3. Every default-deny table must return zero rows for anon.
      for (const probe of [
        { table: "document_annotations" as const, col: "document_id" },
        { table: "job_pieces" as const, col: "project_id" },
        { table: "job_blockers" as const, col: "reason" },
      ]) {
        const { data } = await anon.from(probe.table).select("*").eq(probe.col, SENTINEL);
        expect(data ?? []).toHaveLength(0);
      }

      // 4. Service role still reads the rows back — no regression on the server path.
      const { data: svcAnn } = await sb
        .from("document_annotations")
        .select("id")
        .eq("document_id", SENTINEL);
      expect((svcAnn ?? []).length).toBeGreaterThan(0);
    } finally {
      // 5. Clean up the sentinel rows.
      await sb.from("document_annotations").delete().eq("document_id", SENTINEL);
      await sb.from("job_pieces").delete().eq("project_id", SENTINEL);
      await sb.from("job_blockers").delete().eq("reason", SENTINEL);
    }
  });
});
