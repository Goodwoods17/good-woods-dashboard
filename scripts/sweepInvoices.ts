/* eslint-disable no-console */
/**
 * Invoice extraction sweep — slice 2 scheduled processor.
 *
 * Extends the slice-1 manual extractor (`extractInvoices.ts`) with:
 *   - Bounded retry: ≤3 genuinely different attempts per invoice, then `error`
 *     with the captured last-error message (anti-spin, ADR 0018).
 *   - Accepts an optional `--id <uuid>` flag to process a single invoice.
 *   - Designed to run daily via cron on the home machine (where the `claude`
 *     binary lives). If the machine is off, invoices safely pile up at
 *     `pending` — expected, not a bug.
 *
 * Usage:
 *   npx tsx scripts/sweepInvoices.ts            process all pending
 *   npx tsx scripts/sweepInvoices.ts --id <id>  process one invoice
 *
 * Cron (add to crontab on the home machine, adjust time as desired):
 *   0 20 * * * cd /path/to/good-woods-dashboard && npx tsx scripts/sweepInvoices.ts >> ~/logs/gw-invoice-sweep.log 2>&1
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).
 * Scanned PDFs (New Surrey) require `poppler-utils` on the home machine.
 */
import { config } from "dotenv";
import { resolve } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractInvoice } from "../features/invoices/lib/engine";
import { parseExtractedInvoice } from "../features/invoices/lib/extractedInvoice";
import {
  runSweep,
  type SweepDeps,
  type PendingRow,
} from "../features/invoices/lib/processor";
import type { ExtractedInvoice } from "../features/invoices/lib/types";

const INVOICES_BUCKET = "invoices";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("❌  Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(url, key, { auth: { persistSession: false } });

// Parse --id flag.
const idFlagIdx = process.argv.indexOf("--id");
const onlyId: string | null = idFlagIdx !== -1 ? (process.argv[idFlagIdx + 1] ?? null) : null;

// Temp dirs created per-invoice; cleaned in finally blocks.
const tmpDirs: string[] = [];

const deps: SweepDeps = {
  async fetchPending(): Promise<PendingRow[]> {
    let q = sb.from("invoices").select("id, storage_path, mime").eq("status", "pending");
    if (onlyId) {
      q = sb.from("invoices").select("id, storage_path, mime").eq("id", onlyId);
    }
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
    // filePath here is the storage_path; we download → temp file → engine.
    const bytes = await deps.downloadFile(input.filePath);
    const tmp = await mkdtemp(join(tmpdir(), "gw-invoice-"));
    tmpDirs.push(tmp);
    const ext = input.filePath.split(".").pop() || "pdf";
    const localPath = join(tmp, `source.${ext}`);
    await writeFile(localPath, bytes);
    const raw = await extractInvoice({ filePath: localPath, mime: input.mime });
    return parseExtractedInvoice(raw);
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
    console.log(`  ✓ ${id} → needs_review (${extracted.lines.length} lines)`);
  },

  async writeError(id: string, message: string): Promise<void> {
    await sb.from("invoices").update({ status: "error", error_message: message }).eq("id", id);
    console.error(`  ✗ ${id} → error: ${message}`);
  },
};

async function main() {
  console.log(`[sweepInvoices] started at ${new Date().toISOString()}`);
  try {
    const result = await runSweep(deps);
    if (result.total === 0) {
      console.log("[sweepInvoices] no pending invoices.");
    } else {
      console.log(
        `[sweepInvoices] done — ${result.succeeded} succeeded, ${result.failed} failed (${result.total} total).`
      );
    }
  } finally {
    // Clean up all temp dirs created during this run.
    await Promise.allSettled(tmpDirs.map((d) => rm(d, { recursive: true, force: true })));
  }
}

main().catch((e) => {
  console.error("[sweepInvoices] fatal:", e);
  process.exit(1);
});
