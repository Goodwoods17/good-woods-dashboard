"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Receipt, Upload, ChevronRight } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { Pill } from "@shared/components/ui/Pill";
import { formatDate } from "@shared/lib/format";
import { hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import { captureInvoice, isAcceptedInvoiceFile, listInvoices } from "../lib/invoicesData";
import { INVOICE_STATUS_LABELS, invoiceStatusTone } from "../lib/statusPill";
import type { Invoice } from "../lib/types";

/**
 * /invoices — slice 1 tracer. Upload a supplier bill (PDF / JPG / PNG / HEIC)
 * → it lands in private Storage + a `pending` row, then shows in the list.
 * Extraction runs out-of-band (scripts/extractInvoices.ts) for this slice;
 * the raw extracted JSON is visible on each invoice's detail page.
 */
export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!hasSupabase()) {
      setLoading(false);
      return;
    }
    try {
      setInvoices(await listInvoices());
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onFile = useCallback(
    async (file: File) => {
      if (!isAcceptedInvoiceFile(file)) {
        setError("Unsupported file type. Upload a PDF, JPG, PNG, or HEIC.");
        return;
      }
      setUploading(true);
      setError(null);
      try {
        await captureInvoice(file);
        await refresh();
      } catch (e) {
        setError(formatError(e));
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [refresh]
  );

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="Invoices"
        title="Supplier invoices"
        subtitle="Capture a bill — it's stored instantly, then extracted out-of-band."
        actions={
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-ink-pill px-4 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:opacity-60">
            <Upload className="h-4 w-4" />
            {uploading ? "Uploading…" : "Upload invoice"}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/heic,.pdf,.jpg,.jpeg,.png,.heic"
              aria-label="Upload invoice file"
              data-testid="invoice-upload-input"
              className="hidden"
              disabled={uploading || !hasSupabase()}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
          </label>
        }
      />

      <div className="px-8 pb-12">
        {!hasSupabase() && (
          <p className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
            Connect Supabase to capture invoices.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-text-tertiary">Loading…</p>
        ) : invoices.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface shadow-resting">
            {invoices.map((inv) => (
              <li key={inv.id}>
                <Link
                  href={`/invoices/${inv.id}`}
                  className="flex items-center gap-4 px-4 py-3 transition-colors duration-fast hover:bg-surface-muted"
                  data-testid="invoice-row"
                >
                  <Receipt className="h-5 w-5 shrink-0 text-text-tertiary" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                      {inv.supplier ?? inv.originalFilename ?? "Untitled invoice"}
                    </div>
                    <div className="truncate text-xs text-text-tertiary">
                      {inv.invoiceNumber ? `#${inv.invoiceNumber} · ` : ""}
                      Captured {formatDate(inv.createdAt)}
                    </div>
                  </div>
                  <Pill
                    tone={invoiceStatusTone(inv.status)}
                    label={INVOICE_STATUS_LABELS[inv.status]}
                  />
                  <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-surface p-10 text-center">
      <Receipt className="mx-auto mb-3 h-8 w-8 text-text-tertiary" />
      <p className="text-sm font-medium text-text-primary">No invoices captured yet</p>
      <p className="mt-1 text-sm text-text-secondary">
        Upload a supplier bill to store it and queue it for extraction.
      </p>
    </div>
  );
}
