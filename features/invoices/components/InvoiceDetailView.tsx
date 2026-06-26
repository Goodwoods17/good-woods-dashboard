"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { Pill } from "@shared/components/ui/Pill";
import { formatCAD, formatDate } from "@shared/lib/format";
import { hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import { getInvoiceWithLines } from "../lib/invoicesData";
import { INVOICE_STATUS_LABELS, invoiceStatusTone } from "../lib/statusPill";
import type { Invoice, InvoiceLine } from "../lib/types";

/**
 * /invoices/<id> — slice 1 tracer: shows the captured invoice's status, its
 * extracted header + lines (once the out-of-band extractor has run), and the
 * RAW extracted JSON verbatim. The raw view is the tracer's proof that the
 * home-machine engine's output round-tripped into Supabase.
 */
export function InvoiceDetailView({ id }: { id: string }) {
  const [data, setData] = useState<{ invoice: Invoice; lines: InvoiceLine[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSupabase()) {
      setLoading(false);
      return;
    }
    let active = true;
    (async () => {
      try {
        const result = await getInvoiceWithLines(id);
        if (active) setData(result);
      } catch (e) {
        if (active) setError(formatError(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [id]);

  if (loading) return <Shell title="Invoice">Loading…</Shell>;
  if (error) return <Shell title="Invoice">{error}</Shell>;
  if (!data) return <Shell title="Invoice">Invoice not found.</Shell>;

  const { invoice, lines } = data;
  const money = (n: number | null) => (n === null ? "—" : formatCAD(n));

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="Invoice"
        title={invoice.supplier ?? invoice.originalFilename ?? "Untitled invoice"}
        subtitle={`Captured ${formatDate(invoice.createdAt)}`}
        actions={
          <Pill
            tone={invoiceStatusTone(invoice.status)}
            label={INVOICE_STATUS_LABELS[invoice.status]}
            size="md"
          />
        }
      />

      <div className="space-y-6 px-8 pb-12">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> All invoices
        </Link>

        {invoice.errorMessage && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            Extraction error: {invoice.errorMessage}
          </p>
        )}

        {/* Extracted header (taxes never collapsed). */}
        <section className="rounded-lg border border-border bg-surface p-5 shadow-resting">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Header</h2>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
            <Field label="Supplier" value={invoice.supplier} />
            <Field label="Invoice #" value={invoice.invoiceNumber} />
            <Field label="PO / order ref" value={invoice.poRef} />
            <Field label="Issue date" value={invoice.issueDate} />
            <Field label="Due date" value={invoice.dueDate} />
            <Field label="Pre-tax total" value={money(invoice.preTaxTotal)} />
            <Field label="GST" value={money(invoice.gst)} />
            <Field label="PST" value={money(invoice.pst)} />
            <Field label="Total" value={money(invoice.total)} />
          </dl>
        </section>

        {/* Extracted lines. */}
        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-resting">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-text-primary">
            Lines ({lines.length})
          </h2>
          {lines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-text-tertiary">
              No lines yet — run the extractor to fill them.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface-muted text-left text-xs uppercase text-text-tertiary">
                <tr>
                  <th className="px-4 py-2 font-medium">Qty</th>
                  <th className="px-4 py-2 font-medium">SKU</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Unit</th>
                  <th className="px-4 py-2 text-right font-medium">Unit price</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
                  <th className="px-4 py-2 text-center font-medium">PST</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lines.map((line) => (
                  <tr key={line.id}>
                    <td className="px-4 py-2">{line.qty ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs">{line.sku ?? "—"}</td>
                    <td className="px-4 py-2">{line.description ?? "—"}</td>
                    <td className="px-4 py-2">{line.unit ?? "—"}</td>
                    <td className="px-4 py-2 text-right">{money(line.unitPrice)}</td>
                    <td className="px-4 py-2 text-right">{money(line.amount)}</td>
                    <td className="px-4 py-2 text-center">{line.taxFlag ? "PST" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* Raw extracted JSON — the tracer's proof. */}
        <section className="rounded-lg border border-border bg-surface p-5 shadow-resting">
          <h2 className="mb-3 text-sm font-semibold text-text-primary">Raw extracted JSON</h2>
          {invoice.extractedJson ? (
            <pre
              data-testid="invoice-raw-json"
              className="max-h-96 overflow-auto rounded-md bg-surface-muted p-4 text-xs text-text-secondary"
            >
              {JSON.stringify(invoice.extractedJson, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-text-tertiary">
              Not extracted yet. This invoice is at status{" "}
              <strong>{INVOICE_STATUS_LABELS[invoice.status]}</strong>.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs uppercase text-text-tertiary">{label}</dt>
      <dd className="mt-0.5 text-text-primary">{value ?? "—"}</dd>
    </div>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <PageHeader eyebrow="Invoice" title={title} />
      <div className="px-8 pb-12 text-sm text-text-secondary">{children}</div>
    </div>
  );
}
