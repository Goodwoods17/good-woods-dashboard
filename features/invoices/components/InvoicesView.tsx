"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Receipt, Upload, ChevronRight, Play, AlertCircle } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { Pill } from "@shared/components/ui/Pill";
import { formatDate } from "@shared/lib/format";
import { hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import { captureInvoice, isAcceptedInvoiceFile, listInvoices } from "../lib/invoicesData";
import { CameraCapture } from "./CameraCapture";
import { INVOICE_STATUS_LABELS, invoiceStatusTone } from "../lib/statusPill";
import { getProcessorStatus, type ProcessorStatus } from "../lib/processorStatus";
import type { Invoice } from "../lib/types";

/**
 * /invoices — upload + list view. Slice 2 adds:
 *   - Pending count + "last run at" status bar (derived from the invoices table).
 *   - "Process now" button (POST /api/invoices/process, CRON_SECRET-protected).
 *   - Per-invoice extraction error message surfaced inline.
 */
export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [processorStatus, setProcessorStatus] = useState<ProcessorStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!hasSupabase()) {
      setLoading(false);
      return;
    }
    try {
      const [invList, status] = await Promise.all([listInvoices(), getProcessorStatus()]);
      setInvoices(invList);
      setProcessorStatus(status);
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

  const onProcessNow = useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch("/api/invoices/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`,
        },
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        throw new Error(
          typeof body.error === "string" ? body.error : `HTTP ${res.status}`
        );
      }
      await refresh();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setProcessing(false);
    }
  }, [refresh]);

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="Invoices"
        title="Supplier invoices"
        subtitle="Capture a bill — it's stored instantly, then extracted out-of-band."
        actions={
          <div className="flex items-center gap-2">
            <CameraCapture onCaptured={() => void refresh()} />
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
          </div>
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

        {/* Slice 2: processor status bar — pending count + last run at + Process now. */}
        {hasSupabase() && processorStatus !== null && (
          <div
            data-testid="processor-status"
            className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 shadow-resting"
          >
            <span className="text-sm text-text-secondary">
              <span
                data-testid="pending-count"
                className="font-semibold text-text-primary"
              >
                {processorStatus.pendingCount}
              </span>{" "}
              pending
            </span>
            <span className="text-text-tertiary">·</span>
            <span className="text-sm text-text-secondary" data-testid="last-run-at">
              {processorStatus.lastRunAt
                ? `Last run ${formatDate(processorStatus.lastRunAt)}`
                : "Never run"}
            </span>
            <button
              type="button"
              data-testid="process-now-btn"
              disabled={processing || !hasSupabase()}
              onClick={() => void onProcessNow()}
              className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-muted disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" />
              {processing ? "Processing…" : "Process now"}
            </button>
          </div>
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
                    {/* Slice 2: surface per-invoice extraction error inline. */}
                    {inv.status === "error" && inv.errorMessage && (
                      <div
                        data-testid="invoice-error-message"
                        className="mt-0.5 flex items-start gap-1 text-xs text-red-600"
                      >
                        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{inv.errorMessage}</span>
                      </div>
                    )}
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
