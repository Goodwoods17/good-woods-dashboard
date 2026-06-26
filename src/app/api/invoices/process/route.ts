/**
 * POST /api/invoices/process — "process now" manual trigger (slice 2).
 *
 * Runs the home-machine extraction engine against all `pending` invoices (or
 * a single invoice by id). The daily sweep uses the same engine via the
 * sweepInvoices.ts script; this endpoint is the in-app manual trigger.
 *
 * Auth: Bearer CRON_SECRET (same pattern as /api/cron/daily-briefing). This
 * endpoint is only useful FROM the home machine (the engine shells out to
 * `claude -p`), so the secret double-confirms intent.
 *
 * Feature-flagged: returns 404 unless NEXT_PUBLIC_INVOICES_ENABLED=true.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { invoicesEnabled } from "@features/invoices/lib/featureFlag";
import { processInvoice, type ProcessorDeps, type InvoiceDescriptor } from "@features/invoices/lib/processor";
import { extractInvoice } from "@features/invoices/lib/engine";
import type { ExtractedInvoice } from "@features/invoices/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Extraction can take a while per invoice; give each run up to 5 minutes.
export const maxDuration = 300;

const INVOICES_BUCKET = "invoices";

type InvoiceRow = { id: string; storage_path: string; mime: string | null };

export async function POST(req: Request) {
  if (!invoicesEnabled()) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Auth gate: same Bearer token pattern as the briefing cron.
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase service-role key not configured" }, { status: 500 });
  }
  const sb = createClient(url, key, { auth: { persistSession: false } });

  // Optional: process a single invoice by id (from the request body).
  let invoiceId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (typeof body?.id === "string") invoiceId = body.id;
  } catch {
    // Body parse failure is fine — just process all pending.
  }

  // Fetch pending invoices.
  let query = sb
    .from("invoices")
    .select("id, storage_path, mime")
    .eq("status", "pending");
  if (invoiceId) {
    query = sb.from("invoices").select("id, storage_path, mime").eq("id", invoiceId);
  }
  const { data: pending, error: fetchErr } = await query;
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const rows = (pending ?? []) as InvoiceRow[];
  if (rows.length === 0) {
    return NextResponse.json({ ok: true, processed: 0, errors: [] });
  }

  // Build the production deps (download → extract → write).
  function makeDeps(): ProcessorDeps {
    return {
      async downloadFile(inv: InvoiceDescriptor) {
        const tmpDir = await mkdtemp(join(tmpdir(), "gw-invoice-"));
        const ext = inv.storage_path.split(".").pop() || "pdf";
        const filePath = join(tmpDir, `source.${ext}`);
        const { data: blob, error: dlErr } = await sb.storage
          .from(INVOICES_BUCKET)
          .download(inv.storage_path);
        if (dlErr) throw dlErr;
        await writeFile(filePath, Buffer.from(await blob.arrayBuffer()));
        return { tmpDir, filePath };
      },
      async cleanupTmp(tmpDir: string) {
        await rm(tmpDir, { recursive: true, force: true });
      },
      async extractInvoice(args) {
        return extractInvoice(args);
      },
      async writeBack(invoiceId: string, extracted: ExtractedInvoice) {
        const { error: hErr } = await sb
          .from("invoices")
          .update({
            status: "needs_review",
            error_message: null,
            supplier: extracted.supplier,
            invoice_number: extracted.invoiceNumber,
            issue_date: extracted.issueDate,
            due_date: extracted.dueDate,
            po_ref: extracted.poRef,
            pre_tax_total: extracted.preTaxTotal,
            gst: extracted.gst,
            pst: extracted.pst,
            total: extracted.total,
            extracted_json: extracted,
          })
          .eq("id", invoiceId);
        if (hErr) throw hErr;

        // Replace any prior lines (idempotent re-runs), then insert fresh.
        await sb.from("invoice_lines").delete().eq("invoice_id", invoiceId);
        if (extracted.lines.length > 0) {
          const lineRows = extracted.lines.map((line, i) => ({
            invoice_id: invoiceId,
            line_no: i,
            qty: line.qty,
            sku: line.sku,
            description: line.description,
            unit: line.unit,
            unit_price: line.unitPrice,
            amount: line.amount,
            tax_flag: line.taxFlag,
            confidence: line.confidence,
          }));
          const { error: lErr } = await sb.from("invoice_lines").insert(lineRows);
          if (lErr) throw lErr;
        }
      },
      async markError(invoiceId: string, message: string) {
        await sb
          .from("invoices")
          .update({ status: "error", error_message: message })
          .eq("id", invoiceId);
      },
      log: (msg: string) => console.log(`[invoices/process] ${msg}`),
    };
  }

  const errors: { id: string; error: string }[] = [];
  let processed = 0;

  for (const row of rows) {
    const result = await processInvoice(row, makeDeps());
    if (result.ok) {
      processed++;
    } else {
      errors.push({ id: row.id, error: result.error });
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    processed,
    total: rows.length,
    errors,
  });
}
