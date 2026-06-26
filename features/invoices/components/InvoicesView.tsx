"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Receipt, Upload, ChevronRight, RefreshCw, AlertCircle, Clock } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { Pill } from "@shared/components/ui/Pill";
import { formatDate } from "@shared/lib/format";
import { hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import { captureInvoice, isAcceptedInvoiceFile, listInvoices } from "../lib/invoicesData";
import { getProcessorStatus, type ProcessorStatus } from "../lib/processorStatus";
import { INVOICE_STATUS_LABELS, invoiceStatusTone } from "../lib/statusPill";
import type { Invoice } from "../lib/types";

/**
 * /invoices — shows the invoice list + the slice-2 processor status panel:
 * pending count, last-run timestamp, per-invoice errors, and a "Process now"
 * button that hits the API route (requires CRON_SECRET in the browser session,
 * so it's only usable from the home machine where the env is set).
 */
export function InvoicesView() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<ProcessorStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    if (!hasSupabase()) {
      setLoading(false);
      return;
    }
    try {
      const [invs, st] = await Promise.all([listInvoices(), getProcessorStatus()]);
      setInvoices(invs);
      setStatus(st);
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

  /**
   * "Process now" — POST to the API route. The CRON_SECRET must be present
   * in the window environment (it's set on the home machine only, which is
   * where the extraction engine lives). On other machines, the button shows
   * the auth error from the API.
   */
  const onProcessNow = useCallback(async () => {
    setProcessing(true);
    setError(null);
    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET;
      const res = await fetch("/api/invoices/process", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
      });
      const json = (await res.json()) as {
        ok: boolean;
        processed?: number;
        total?: number;
        errors?: { id: string; error: string }[];
        error?: string;
      };
      if (!res.ok) {
        setError(json.error ?? `Server error ${res.status}`);
      } else if (!json.ok && json.errors?.length) {
        setError(
          `${json.errors.length} invoice(s) failed. See error invoices below.`
        );
      }
      // Refresh the list regardless of outcome to show updated statuses.
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
            <button
              type="button"
              aria-label="Process now"
              data-testid="process-now-btn"
              disabled={processing || !hasSupabase()}
              onClick={onProcessNow}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${processing ? "animate-spin" : ""}`} />
              {processing ? "Processing…" : "Process now"}
            </button>
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

      <div className="space-y-6 px-8 pb-12">
        {!hasSupabase() && (
          <p className="rounded-lg border border-border bg-surface p-4 text-sm text-text-secondary">
            Connect Supabase to capture invoices.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {/* Processor status panel (slice 2). */}
        {status && hasSupabase() && (
          <ProcessorStatusPanel status={status} />
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
                    {/* Inline error reason for at-a-glance diagnosis. */}
                    {inv.status === "error" && inv.errorMessage && (
                      <div className="mt-0.5 flex items-center gap-1 truncate text-xs text-red-600">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        {inv.errorMessage}
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

/** Small status banner: pending count + last run time. */
function ProcessorStatusPanel({ status }: { status: ProcessorStatus }) {
  const { pendingCount, lastRunAt, errorInvoices } = status;
  const hasErrors = errorInvoices.length > 0;

  return (
    <div
      data-testid="processor-status-panel"
      className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm shadow-resting"
    >
      <span className="flex items-center gap-1.5 text-text-secondary">
        <span
          className={`inline-block h-2 w-2 rounded-full ${pendingCount > 0 ? "bg-amber-400" : "bg-emerald-400"}`}
        />
        <span data-testid="pending-count">
          {pendingCount} pending
        </span>
      </span>

      {lastRunAt && (
        <span className="flex items-center gap-1.5 text-text-tertiary">
          <Clock className="h-3.5 w-3.5" />
          <span data-testid="last-run-at">
            Last run {formatDate(lastRunAt)}
          </span>
        </span>
      )}

      {hasErrors && (
        <span className="flex items-center gap-1.5 text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          <span data-testid="error-count">
            {errorInvoices.length} error{errorInvoices.length !== 1 ? "s" : ""} — see list below
          </span>
        </span>
      )}
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
