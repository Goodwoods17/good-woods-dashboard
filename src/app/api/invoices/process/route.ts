/**
 * POST /api/invoices/process — manual "process now" trigger for slice 2.
 *
 * Protected by the same CRON_SECRET used for other cron endpoints.  The body
 * may include an optional `invoiceId` to process a single invoice; omitting it
 * processes all `pending`.
 *
 * This route runs the home-machine engine (`extractInvoice` → `claude -p`).
 * It works when the dev server is running on the home machine (where the
 * `claude` binary lives). The feature flag keeps this route unreachable in
 * prod (the /invoices page 404s there).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractInvoice } from "@features/invoices/lib/engine";
import {
  runSweep,
  type SweepDeps,
  type PendingRow,
} from "@features/invoices/lib/processor";
import type { ExtractedInvoice } from "@features/invoices/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Allow up to 5 min — extraction per invoice can take 30–60 s on Opus 4.8.
export const maxDuration = 300;

const INVOICES_BUCKET = "invoices";

export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase credentials not configured" }, { status: 500 });
  }

  const sb = createClient(url, key, { auth: { persistSession: false } });

  let invoiceId: string | undefined;
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.invoiceId === "string") invoiceId = body.invoiceId;
  } catch {
    // body is optional — ignore parse errors
  }

  // Temp directories created per-invoice; tracked for cleanup.
  const tmpDirs: string[] = [];

  const deps: SweepDeps = {
    async fetchPending(): Promise<PendingRow[]> {
      let q = sb.from("invoices").select("id, storage_path, mime").eq("status", "pending");
      // Keep the status=pending filter even when targeting one id, so re-running
      // on a reviewed/posted invoice can't silently re-extract and wipe edits.
      if (invoiceId) q = q.eq("id", invoiceId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as PendingRow[];
    },

    async downloadFile(storagePath: string): Promise<Buffer> {
      const { data: blob, error } = await sb.storage.from(INVOICES_BUCKET).download(storagePath);
      if (error) throw error;
      return Buffer.from(await blob.arrayBuffer());
    },

    async extract(input: { id: string; filePath: string; mime: string }): Promise<ExtractedInvoice> {
      // Download to a fresh temp dir so the engine can read the file.
      const bytes = await deps.downloadFile(input.filePath);
      const tmp = await mkdtemp(join(tmpdir(), "gw-invoice-"));
      tmpDirs.push(tmp);
      const ext = input.filePath.split(".").pop() || "pdf";
      const localPath = join(tmp, `source.${ext}`);
      await writeFile(localPath, bytes);
      // extractInvoice already validates through parseExtractedInvoice (its trust boundary).
      return extractInvoice({ filePath: localPath, mime: input.mime });
    },

    async writeSuccess(id: string, extracted: ExtractedInvoice): Promise<void> {
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
        .eq("id", id);
      if (hErr) throw hErr;

      // Replace any prior lines (idempotent re-run).
      await sb.from("invoice_lines").delete().eq("invoice_id", id);
      if (extracted.lines.length > 0) {
        const rows = extracted.lines.map((line, i) => ({
          invoice_id: id,
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
        const { error: lErr } = await sb.from("invoice_lines").insert(rows);
        if (lErr) throw lErr;
      }
    },

    async writeError(id: string, message: string): Promise<void> {
      await sb.from("invoices").update({ status: "error", error_message: message }).eq("id", id);
    },
  };

  try {
    const result = await runSweep(deps);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "unknown";
    console.error("[api/invoices/process] sweep failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    // Clean up temp dirs even if extraction threw.
    await Promise.allSettled(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  }
}
