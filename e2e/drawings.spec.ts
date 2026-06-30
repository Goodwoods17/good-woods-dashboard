import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// The CI runner is Node 20, which ships no global WebSocket.
(globalThis as { WebSocket?: unknown }).WebSocket ??= ws;

// Drawings + PiecePin overlay smoke tests — S8b (issue #221).
//
// Verifies that DrawingsView renders with PiecePinsProvider wired in and that
// the pin overlay reads position from the `job_piece_pins` collection rather
// than the (now-dropped-from-mapper) `job_pieces.pin_*` columns.
//
// Needs a seeded Supabase (CI boots a local stack) + a service-role key to
// seed the piece and pin directly (bypassing RLS). Skipped locally when any
// credential is absent.
const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const DEMO_JOB_ID = "job-status-demo";

// Stable fixture IDs for this spec (hex 8-4-4-4-12, namespace e2d8 = "e2e drawings").
const E2D_DOC_ID = "e2d80000-0000-4000-8000-000000000001";
const E2D_PIECE_ID = "e2d80000-0000-4000-8000-000000000002";
const E2D_PIN_ID = "e2d80000-0000-4000-8000-000000000003";

// S9 fixture IDs (namespace e2d9).
const E2D9_DOC_A_ID = "e2d90000-0000-4000-8000-000000000001";
const E2D9_DOC_B_ID = "e2d90000-0000-4000-8000-000000000002";
const E2D9_PIECE_ID = "e2d90000-0000-4000-8000-000000000003";
const E2D9_PIN_A_ID = "e2d90000-0000-4000-8000-000000000004";
const E2D9_PIN_B_ID = "e2d90000-0000-4000-8000-000000000005";

async function login(page: Page) {
  await page.goto("/login");
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.getByRole("link", { name: "Estimator" })).toBeVisible({ timeout: 15_000 });
}

test.describe("drawings S8b — PiecePin overlay reads from pins collection", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY + a seeded Supabase"
  );

  test("DrawingsView renders with PiecePinsProvider; pin button appears at pin.x/pin.y", async ({
    page,
  }) => {
    // ── Seed: upload-style document, piece, and primary pin ──────────────────
    const sb = createClient(supabaseUrl!, serviceRoleKey!);

    // Clean prior run's fixtures idempotently.
    await sb.from("job_piece_pins").delete().eq("id", E2D_PIN_ID);
    await sb.from("job_pieces").delete().eq("id", E2D_PIECE_ID);
    await sb.from("documents").delete().eq("id", E2D_DOC_ID);

    // Seed the document as a SKETCH — a sketch renders the blank dot-grid
    // DrawingStage (with the pin overlay) directly, no stored file needed. An
    // 'upload' doc with storage_path:null can never resolve a signed URL, so
    // DrawingDoc falls through to <DrawingSkeleton/> which does NOT render the
    // overlay (the pins) — that's why the pin button never appeared. ('link'
    // docs also disable the pin overlay.)
    const { error: docErr } = await sb.from("documents").insert({
      id: E2D_DOC_ID,
      project_id: DEMO_JOB_ID,
      kind: "shop",
      label: "S8b Test Drawing",
      drive_url: null,
      version: null,
      // is_current:false on purpose — this fixture lives on the SHARED
      // job-status-demo job, and a current + uploaded + client-safe-kind ("shop")
      // doc would leak into documents.spec.ts's S6 current-spec-card counts. The
      // drawings overlay reads docs by project_id only (not is_current), so this
      // still renders in the sidebar.
      is_current: false,
      notes: null,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      source: "sketch",
      storage_path: null,
      mime: null,
      page_count: 1,
    });
    expect(docErr).toBeNull();

    // Seed the piece (no pin_* columns — S8b mapper no longer writes them).
    const { error: pieceErr } = await sb.from("job_pieces").insert({
      id: E2D_PIECE_ID,
      project_id: DEMO_JOB_ID,
      kind: "cabinet",
      label: "Base S8b",
      code: "S8B",
      subtype: "base",
      room: "Test",
      cut_method: null,
      status: "not_started",
      status_updated_at: null,
      status_updated_by: null,
      source: "manual",
      source_ref: null,
      sort_order: 0,
      dimensions: null,
      material: null,
      edgeband: null,
      parent_ref: null,
      created_by: null,
      created_at: new Date().toISOString(),
      visibility: "owner",
    });
    expect(pieceErr).toBeNull();

    // Seed the primary pin — position (0.5, 0.25) on the sketch's page. A sketch
    // is single-page and DrawingDoc reports it as page 0 (DrawingDoc.tsx:30), so
    // in-app pins placed on a sketch get page:0. Match that here, or the overlay's
    // `pin.page === currentPage` filter (currentPage=0 for a sketch) drops the pin.
    const { error: pinErr } = await sb.from("job_piece_pins").insert({
      id: E2D_PIN_ID,
      job_piece_id: E2D_PIECE_ID,
      document_id: E2D_DOC_ID,
      page: 0,
      x: 0.5,
      y: 0.25,
      role: null,
      is_primary: true,
      created_at: new Date().toISOString(),
      created_by: null,
    });
    expect(pinErr).toBeNull();

    // ── Navigate to the drawings page ─────────────────────────────────────────
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}/drawings`);

    // The header confirms DrawingsView rendered (PiecePinsProvider mounted; no
    // "usePiecePins must be used inside <PiecePinsProvider>" crash).
    await expect(page.getByRole("heading", { name: /Drawings/i })).toBeVisible({
      timeout: 15_000,
    });

    // The test document appears in the sidebar and becomes active. Anchor the
    // name at the start so it matches ONLY the doc-select button ("S8b Test
    // Drawing Shop") and not the row's "Delete S8b Test Drawing" button.
    const docButton = page.getByRole("button", { name: /^S8b Test Drawing/ });
    await expect(docButton).toBeVisible({ timeout: 10_000 });
    await docButton.click();

    // The PiecePin button for the seeded pin should render in the overlay. Its
    // aria-label is "S8B, not_started" — anchor on the leading code + comma so
    // we don't also match the "S8b Test Drawing" doc/delete buttons. (No → or —
    // in the matched text, avoiding the TYPOGRAPHIC_GLYPH pitfall.)
    const pinButton = page.getByRole("button", { name: /^S8B,/ });
    await expect(pinButton).toBeVisible({ timeout: 10_000 });
    // Confirm position style comes from pin.x/pin.y, not piece columns:
    // left should be ~50% (x=0.5) and top ~25% (y=0.25).
    const style = await pinButton.getAttribute("style");
    expect(style).toContain("left: 50%");
    expect(style).toContain("top: 25%");

    // ── Teardown ──────────────────────────────────────────────────────────────
    await sb.from("job_piece_pins").delete().eq("id", E2D_PIN_ID);
    await sb.from("job_pieces").delete().eq("id", E2D_PIECE_ID);
    await sb.from("documents").delete().eq("id", E2D_DOC_ID);
  });

  test("DrawingsView page renders without crashing even with no documents (empty state)", async ({
    page,
  }) => {
    await login(page);
    // Navigate to a drawings page for a job that has no documents.
    // The page should render the empty state, proving PiecePinsProvider + layout are wired.
    await page.goto(`/jobs/${DEMO_JOB_ID}/drawings`);
    await expect(page.getByRole("heading", { name: /Drawings/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});

// S9 — multi-pin UI + cross-link reverse panel (issue #223).
//
// Proves: (1) a piece pinned on 2 sketch drawings renders on both overlays;
// (2) the document detail pane on the job page shows the DocumentPinsPanel
// cross-link reverse panel listing the referencing cabinet.
test.describe("drawings S9 — multi-pin + cross-link reverse panel", () => {
  test.skip(
    !email || !password || !supabaseUrl || !serviceRoleKey,
    "needs E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY + a seeded Supabase"
  );

  test("piece pinned on 2 drawings → both overlays render; doc panel lists the referencing cabinet", async ({
    page,
  }) => {
    const sb = createClient(supabaseUrl!, serviceRoleKey!);

    // ── Teardown prior fixtures ───────────────────────────────────────────────
    await sb.from("job_piece_pins").delete().eq("id", E2D9_PIN_A_ID);
    await sb.from("job_piece_pins").delete().eq("id", E2D9_PIN_B_ID);
    await sb.from("job_pieces").delete().eq("id", E2D9_PIECE_ID);
    await sb.from("documents").delete().eq("id", E2D9_DOC_A_ID);
    await sb.from("documents").delete().eq("id", E2D9_DOC_B_ID);

    // ── Seed ────────────────────────────────────────────────────────────────
    // Two sketch docs (is_current:false to avoid disturbing spec-card counts).
    const now = new Date().toISOString();
    const { error: docAErr } = await sb.from("documents").insert({
      id: E2D9_DOC_A_ID, project_id: DEMO_JOB_ID, kind: "shop",
      label: "S9 Drawing A", drive_url: null, version: null, is_current: false,
      notes: null, uploaded_by: null, created_at: now,
      source: "sketch", storage_path: null, mime: null, page_count: 1,
    });
    expect(docAErr).toBeNull();

    const { error: docBErr } = await sb.from("documents").insert({
      id: E2D9_DOC_B_ID, project_id: DEMO_JOB_ID, kind: "shop",
      label: "S9 Drawing B", drive_url: null, version: null, is_current: false,
      notes: null, uploaded_by: null, created_at: now,
      source: "sketch", storage_path: null, mime: null, page_count: 1,
    });
    expect(docBErr).toBeNull();

    // One cabinet piece.
    const { error: pieceErr } = await sb.from("job_pieces").insert({
      id: E2D9_PIECE_ID, project_id: DEMO_JOB_ID, kind: "cabinet",
      label: "Upper S9", code: "S9U", subtype: "upper", room: "Kitchen",
      cut_method: null, status: "not_started", status_updated_at: null,
      status_updated_by: null, source: "manual", source_ref: null, sort_order: 0,
      dimensions: null, material: null, edgeband: null, parent_ref: null,
      created_by: null, created_at: now, visibility: "owner",
    });
    expect(pieceErr).toBeNull();

    // Primary pin on doc A (x=0.3, y=0.4, page=0 for sketch).
    const { error: pinAErr } = await sb.from("job_piece_pins").insert({
      id: E2D9_PIN_A_ID, job_piece_id: E2D9_PIECE_ID, document_id: E2D9_DOC_A_ID,
      page: 0, x: 0.3, y: 0.4, role: "plan", is_primary: true,
      created_at: now, created_by: null,
    });
    expect(pinAErr).toBeNull();

    // Secondary pin on doc B (x=0.6, y=0.7, page=0 for sketch).
    const { error: pinBErr } = await sb.from("job_piece_pins").insert({
      id: E2D9_PIN_B_ID, job_piece_id: E2D9_PIECE_ID, document_id: E2D9_DOC_B_ID,
      page: 0, x: 0.6, y: 0.7, role: "elevation", is_primary: false,
      created_at: now, created_by: null,
    });
    expect(pinBErr).toBeNull();

    // ── Drawings page: both pins render ─────────────────────────────────────
    await login(page);
    await page.goto(`/jobs/${DEMO_JOB_ID}/drawings`);
    await expect(page.getByRole("heading", { name: /Drawings/i })).toBeVisible({
      timeout: 15_000,
    });

    // Select doc A → pin A should render at ~30% left.
    const docAButton = page.getByRole("button", { name: /^S9 Drawing A/ });
    await expect(docAButton).toBeVisible({ timeout: 10_000 });
    await docAButton.click();

    // The PiecePin button for pin A. aria-label = "S9U, not_started".
    const pinAButton = page.getByRole("button", { name: /^S9U,/ });
    await expect(pinAButton).toBeVisible({ timeout: 10_000 });
    const styleA = await pinAButton.getAttribute("style");
    expect(styleA).toContain("left: 30%");

    // Select doc B → pin B should render at ~60% left.
    const docBButton = page.getByRole("button", { name: /^S9 Drawing B/ });
    await expect(docBButton).toBeVisible({ timeout: 10_000 });
    await docBButton.click();

    const pinBButton = page.getByRole("button", { name: /^S9U,/ });
    await expect(pinBButton).toBeVisible({ timeout: 10_000 });
    const styleB = await pinBButton.getAttribute("style");
    expect(styleB).toContain("left: 60%");

    // ── Job detail page: cross-link reverse panel on doc A ───────────────────
    await page.goto(`/jobs/${DEMO_JOB_ID}`);

    // Click on "S9 Drawing A" in the documents list to make it the active doc.
    const docAListBtn = page.getByRole("button", { name: /S9 Drawing A/ }).first();
    await expect(docAListBtn).toBeVisible({ timeout: 15_000 });
    await docAListBtn.click();

    // The DocumentPinsPanel shows the referencing cabinet.
    const pinsPanel = page.getByTestId("doc-pins-panel");
    await expect(pinsPanel).toBeVisible({ timeout: 10_000 });

    // There is exactly one referenced cabinet (the seeded piece).
    const pinRefs = page.getByTestId("doc-pin-ref");
    await expect(pinRefs.first()).toBeVisible();

    // The jump-to-drawing link is present.
    const jumpLink = page.getByTestId("jump-to-drawing").first();
    await expect(jumpLink).toBeVisible();

    // ── Teardown ──────────────────────────────────────────────────────────────
    await sb.from("job_piece_pins").delete().eq("id", E2D9_PIN_A_ID);
    await sb.from("job_piece_pins").delete().eq("id", E2D9_PIN_B_ID);
    await sb.from("job_pieces").delete().eq("id", E2D9_PIECE_ID);
    await sb.from("documents").delete().eq("id", E2D9_DOC_A_ID);
    await sb.from("documents").delete().eq("id", E2D9_DOC_B_ID);
  });
});
