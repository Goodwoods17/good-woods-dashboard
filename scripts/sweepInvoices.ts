/* eslint-disable no-console */
// Daily invoice sweep — home-machine engine (slice 2).
//
// Called by the `gw` tmux watchdog / cron at a set time each day to drain
// all `pending` invoices via the bounded-retry processor (features/invoices/lib/processor.ts).
// Also callable on demand:
//
//   npx tsx scripts/sweepInvoices.ts            # process all pending
//   npx tsx scripts/sweepInvoices.ts <id>       # process one invoice by id
//
// This is the successor to scripts/extractInvoices.ts (which was the manual
// one-shot for slice 1). The two coexist: extractInvoices.ts for ad-hoc
// inspection, sweepInvoices.ts for the scheduled + on-demand path.
//
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local)
// Requires: poppler-utils on the home machine (for scanned PDFs — New Surrey).
import { config } from "dotenv";
import { resolve } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { processInvoice, type ProcessorDeps, type InvoiceDescriptor } from "../features/invoices/lib/processor";
import { extractInvoice } from "../features/invoices/lib/engine";
import type { ExtractedInvoice } from "../features/invoices/lib/types";

const INVOICES_BUCKET = "invoices";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const onlyId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;

/** Build the production ProcessorDeps for the home-machine script context. */
function makeScriptDeps(): ProcessorDeps {
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
    log: (msg: string) => console.log(msg),
  };
}

async function main() {
  let query = sb.from("invoices").select("id, storage_path, mime").eq("status", "pending");
  if (onlyId) {
    query = sb.from("invoices").select("id, storage_path, mime").eq("id", onlyId);
  }

  const { data: pending, error } = await query;
  if (error) throw error;

  const rows = (pending ?? []) as InvoiceDescriptor[];
  if (rows.length === 0) {
    console.log("No pending invoices to extract.");
    return;
  }
  console.log(`Extracting ${rows.length} invoice(s)…`);

  let successCount = 0;
  let errorCount = 0;

  for (const row of rows) {
    const result = await processInvoice(row, makeScriptDeps());
    if (result.ok) {
      successCount++;
    } else {
      errorCount++;
      console.error(`  ✗ ${row.id}: ${result.error}`);
    }
  }

  console.log(`\nDone: ${successCount} extracted, ${errorCount} failed.`);
  if (errorCount > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
