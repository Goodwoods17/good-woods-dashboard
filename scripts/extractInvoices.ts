/* eslint-disable no-console */
// Invoice extraction sweep (slice 1 tracer — run MANUALLY this slice; slice 2
// puts it on a daily schedule + a "process now" button). Picks up `pending`
// invoices, downloads each source file from the private `invoices` Storage
// bucket, runs the swappable home-machine engine (extractInvoice → strict JSON,
// ADR 0019), and writes the header + lines back, flipping status →
// `needs_review`. On failure it records the message and flips status → `error`.
//
// Scanned PDFs (New Surrey) require `poppler-utils` on the home machine.
//
// Usage:
//   npx tsx scripts/extractInvoices.ts            process all pending
//   npx tsx scripts/extractInvoices.ts <id>       process one invoice by id
//
// Env: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env.local).
import { config } from "dotenv";
import { resolve } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { extractInvoice } from "../features/invoices/lib/engine";
import type { ExtractedInvoice } from "../features/invoices/lib/types";

// Bucket name (mirrors features/invoices/lib/storage.ts INVOICES_BUCKET).
// Not imported from that module because it pulls the browser Supabase client
// (@shared/lib/supabase), which tsx can't resolve in this Node script.
const INVOICES_BUCKET = "invoices";

config({ path: resolve(process.cwd(), ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
}

const sb = createClient(url, key, { auth: { persistSession: false } });
const onlyId = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : null;

async function main() {
  let query = sb.from("invoices").select("*").eq("status", "pending");
  // Keep status=pending even when targeting one id — re-running on a
  // reviewed/posted invoice must not silently re-extract and discard edits.
  if (onlyId) query = query.eq("id", onlyId);
  const { data: pending, error } = await query;
  if (error) throw error;

  if (!pending || pending.length === 0) {
    console.log("No pending invoices to extract.");
    return;
  }
  console.log(`Extracting ${pending.length} invoice(s)…`);

  for (const inv of pending) {
    await processOne(inv as { id: string; storage_path: string; mime: string | null });
  }
}

async function processOne(inv: { id: string; storage_path: string; mime: string | null }) {
  console.log(`\n• ${inv.id} (${inv.storage_path})`);
  let tmp: string | null = null;
  try {
    // 1. Download the source file from Storage to a temp path the engine reads.
    const { data: blob, error: dlErr } = await sb.storage
      .from(INVOICES_BUCKET)
      .download(inv.storage_path);
    if (dlErr) throw dlErr;

    tmp = await mkdtemp(join(tmpdir(), "gw-invoice-"));
    const ext = inv.storage_path.split(".").pop() || "pdf";
    const filePath = join(tmp, `source.${ext}`);
    await writeFile(filePath, Buffer.from(await blob.arrayBuffer()));

    // 2. Run the swappable engine → validated strict JSON.
    const extracted = await extractInvoice({
      filePath,
      mime: inv.mime || "application/pdf",
    });

    // 3. Write header + lines, flip to needs_review.
    await writeBack(inv.id, extracted);
    console.log(`  → needs_review (${extracted.lines.length} lines)`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`  ✗ ${message}`);
    await sb.from("invoices").update({ status: "error", error_message: message }).eq("id", inv.id);
  } finally {
    if (tmp) await rm(tmp, { recursive: true, force: true });
  }
}

async function writeBack(invoiceId: string, extracted: ExtractedInvoice) {
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
    const rows = extracted.lines.map((line, i) => ({
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
    const { error: lErr } = await sb.from("invoice_lines").insert(rows);
    if (lErr) throw lErr;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
