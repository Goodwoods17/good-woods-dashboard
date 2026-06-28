/**
 * QBO S4 — Account + tax-code mapping API (issue #150).
 *
 * GET  /api/invoices/qbo/mappings
 *   Return the connected company's accounts + tax codes, the persisted
 *   account/tax mappings, the GST/PST auto-suggestions, and the unmapped-state
 *   signal that feeds the (future) block-until-mapped gate.
 *   Optional `?accountKeys=a,b,c` lists the local category keys a pending sync
 *   would touch (so the gate knows which accounts must be mapped).
 *
 * POST /api/invoices/qbo/mappings
 *   Persist one mapping.
 *   Body: { kind: "account" | "taxcode", localId: string, qboId: string }
 *
 * Both routes are gated on `NEXT_PUBLIC_INVOICES_QBO_ENABLED` (404 when off) and
 * protected by the app's auth middleware (owner-only, same as QBO S1–S3).
 * Degrade cleanly when QBO is unconfigured or the token is missing — never 5xx.
 */
import { NextRequest, NextResponse } from "next/server";
import { invoicesQboEnabled } from "@features/invoices/lib/featureFlag";
import { getMappingState, saveMapping } from "@features/invoices/lib/qboAccountMappingServer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// GET — full mapping state (accounts, tax codes, links, suggestions, gate)
// ---------------------------------------------------------------------------

export async function GET(request: NextRequest) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const raw = request.nextUrl.searchParams.get("accountKeys");
  const accountKeys = raw
    ? raw
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  const state = await getMappingState(accountKeys);

  switch (state.status) {
    case "unconfigured":
      return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
    case "not_connected":
      return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 400 });
    case "qbo_error":
      return NextResponse.json(
        { ok: false, reason: "qbo_error", message: state.message },
        { status: 502 }
      );
    case "ok":
      return NextResponse.json({
        ok: true,
        accounts: state.accounts,
        taxCodes: state.taxCodes,
        accountByLocal: state.accountByLocal,
        taxByLocal: state.taxByLocal,
        taxSuggestions: state.taxSuggestions,
        unmapped: state.unmapped,
      });
  }
}

// ---------------------------------------------------------------------------
// POST — persist one account / tax-code mapping
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  if (!invoicesQboEnabled()) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  let body: { kind?: unknown; localId?: unknown; qboId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }

  if (body.kind !== "account" && body.kind !== "taxcode") {
    return NextResponse.json({ ok: false, reason: "invalid_kind" }, { status: 400 });
  }
  if (!body.localId || typeof body.localId !== "string") {
    return NextResponse.json({ ok: false, reason: "missing_local_id" }, { status: 400 });
  }
  if (!body.qboId || typeof body.qboId !== "string") {
    return NextResponse.json({ ok: false, reason: "missing_qbo_id" }, { status: 400 });
  }

  const result = await saveMapping({
    kind: body.kind,
    localId: body.localId,
    qboId: body.qboId,
  });

  switch (result.status) {
    case "unconfigured":
      return NextResponse.json({ ok: false, reason: "unconfigured" }, { status: 503 });
    case "not_connected":
      return NextResponse.json({ ok: false, reason: "not_connected" }, { status: 400 });
    case "invalid":
      return NextResponse.json(
        { ok: false, reason: "invalid", message: result.message },
        { status: 400 }
      );
    case "saved":
      return NextResponse.json({
        ok: true,
        status: "saved",
        localType: result.localType,
        localId: result.localId,
        qboId: result.qboId,
      });
  }
}
