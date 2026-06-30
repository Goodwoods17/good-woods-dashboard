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
const E2D_DOC_ID   = "e2d80000-0000-4000-8000-000000000001";
const E2D_PIECE_ID = "e2d80000-0000-4000-8000-000000000002";
const E2D_PIN_ID   = "e2d80000-0000-4000-8000-000000000003";

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

    // Seed the document (source:'upload' so the overlay is drawn; source:'link'
    // disables the pin overlay in DrawingsView).
    const { error: docErr } = await sb.from("documents").insert({
      id: E2D_DOC_ID,
      project_id: DEMO_JOB_ID,
      kind: "shop",
      label: "S8b Test Drawing",
      drive_url: null,
      version: null,
      is_current: true,
      notes: null,
      uploaded_by: null,
      created_at: new Date().toISOString(),
      source: "upload",
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

    // Seed the primary pin — position (0.5, 0.25) on page 1 of the document.
    const { error: pinErr } = await sb.from("job_piece_pins").insert({
      id: E2D_PIN_ID,
      job_piece_id: E2D_PIECE_ID,
      document_id: E2D_DOC_ID,
      page: 1,
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

    // The test document appears in the sidebar and becomes active.
    const docButton = page.getByRole("button", { name: "S8b Test Drawing" });
    await expect(docButton).toBeVisible({ timeout: 10_000 });
    await docButton.click();

    // The PiecePin button for the seeded pin should render in the overlay.
    // The button's aria-label contains the piece code/label and status — use
    // data-testid-free locator to avoid TYPOGRAPHIC_GLYPH pitfall (no → or —).
    const pinButton = page.getByRole("button", { name: /S8B/i });
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
