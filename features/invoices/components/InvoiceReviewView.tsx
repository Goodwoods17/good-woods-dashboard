"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, AlertTriangle, CheckCircle, Info } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { cn } from "@shared/lib/utils";
import { formatError } from "@shared/lib/formatError";
import { saveReviewedInvoice, checkDuplicateInvoice } from "../lib/invoicesData";
import { isLowConfidence, validateMath, type MathError } from "../lib/reviewInvoice";
import type { Invoice, InvoiceLine } from "../lib/types";

// ---------------------------------------------------------------------------
// Draft types — string state for all inputs so the user can type freely.
// Numbers are parsed back on save / math validation.
// ---------------------------------------------------------------------------

interface HeaderDraft {
  supplier: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  poRef: string;
  preTaxTotal: string;
  gst: string;
  pst: string;
  total: string;
}

interface LineDraft {
  id: string;
  lineNo: number;
  qty: string;
  sku: string;
  description: string;
  unit: string;
  unitPrice: string;
  amount: string;
  taxFlag: boolean;
  confidence: number | null;
}

function toHeaderDraft(inv: Invoice): HeaderDraft {
  return {
    supplier: inv.supplier ?? "",
    invoiceNumber: inv.invoiceNumber ?? "",
    issueDate: inv.issueDate ?? "",
    dueDate: inv.dueDate ?? "",
    poRef: inv.poRef ?? "",
    preTaxTotal: inv.preTaxTotal?.toString() ?? "",
    gst: inv.gst?.toString() ?? "",
    pst: inv.pst?.toString() ?? "",
    total: inv.total?.toString() ?? "",
  };
}

function toLineDraft(line: InvoiceLine): LineDraft {
  return {
    id: line.id,
    lineNo: line.lineNo,
    qty: line.qty?.toString() ?? "",
    sku: line.sku ?? "",
    description: line.description ?? "",
    unit: line.unit ?? "",
    unitPrice: line.unitPrice?.toString() ?? "",
    amount: line.amount?.toString() ?? "",
    taxFlag: line.taxFlag ?? false,
    confidence: line.confidence,
  };
}

/** Parse a Canadian-formatted number string to a JS number, or null if empty/invalid. */
function parseNum(s: string): number | null {
  const cleaned = s.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function InvoiceReviewView({
  invoice,
  lines: initialLines,
  onSaved,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  onSaved: () => void;
}) {
  const [header, setHeader] = useState<HeaderDraft>(() => toHeaderDraft(invoice));
  const [lines, setLines] = useState<LineDraft[]>(() => initialLines.map(toLineDraft));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Invoice | null>(null);
  const [dupChecking, setDupChecking] = useState(false);

  // Derived: math errors from current draft state (recalculated on every render).
  const mathErrors = validateMath(
    {
      preTaxTotal: parseNum(header.preTaxTotal),
      gst: parseNum(header.gst),
      pst: parseNum(header.pst),
      total: parseNum(header.total),
    },
    lines.map((l) => ({ amount: parseNum(l.amount) }))
  );

  // Duplicate guard: check whenever supplier + invoiceNumber are both filled.
  useEffect(() => {
    const sup = header.supplier.trim();
    const num = header.invoiceNumber.trim();
    if (!sup || !num) {
      setDuplicate(null);
      return;
    }
    let active = true;
    setDupChecking(true);
    checkDuplicateInvoice(sup, num, invoice.id)
      .then((found) => {
        if (active) setDuplicate(found);
      })
      .catch(() => {
        // Silently ignore — duplicate check is advisory only.
      })
      .finally(() => {
        if (active) setDupChecking(false);
      });
    return () => {
      active = false;
    };
  }, [header.supplier, header.invoiceNumber, invoice.id]);

  // Header field helpers.
  const setHeaderField = useCallback(
    (field: keyof HeaderDraft) => (e: React.ChangeEvent<HTMLInputElement>) => {
      setHeader((h) => ({ ...h, [field]: e.target.value }));
    },
    []
  );

  // Line field helpers.
  const setLineField = useCallback(
    (lineId: string, field: keyof Omit<LineDraft, "id" | "lineNo" | "confidence">) =>
      (e: React.ChangeEvent<HTMLInputElement>) => {
        const value = field === "taxFlag" ? e.target.checked : e.target.value;
        setLines((ls) =>
          ls.map((l) => (l.id === lineId ? { ...l, [field]: value } : l))
        );
      },
    []
  );

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await saveReviewedInvoice(
        invoice.id,
        {
          supplier: header.supplier.trim() || null,
          invoiceNumber: header.invoiceNumber.trim() || null,
          issueDate: header.issueDate.trim() || null,
          dueDate: header.dueDate.trim() || null,
          poRef: header.poRef.trim() || null,
          preTaxTotal: parseNum(header.preTaxTotal),
          gst: parseNum(header.gst),
          pst: parseNum(header.pst),
          total: parseNum(header.total),
        },
        lines.map((l) => ({
          id: l.id,
          qty: parseNum(l.qty),
          sku: l.sku.trim() || null,
          description: l.description.trim() || null,
          unit: l.unit.trim() || null,
          unitPrice: parseNum(l.unitPrice),
          amount: parseNum(l.amount),
          taxFlag: l.taxFlag,
        }))
      );
      onSaved();
    } catch (e) {
      setError(formatError(e));
    } finally {
      setSaving(false);
    }
  }, [invoice.id, header, lines, onSaved]);

  return (
    <div className="min-h-screen" data-testid="invoice-review-form">
      <PageHeader
        eyebrow="Invoice"
        title={header.supplier || invoice.originalFilename || "Review invoice"}
        subtitle="Review and correct the extracted data before marking as reviewed."
      />

      <div className="space-y-6 px-8 pb-12">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> All invoices
        </Link>

        {/* Duplicate-invoice warning banner. */}
        {duplicate && (
          <div
            data-testid="duplicate-warning"
            className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                Possible duplicate invoice
              </p>
              <p className="mt-0.5 text-sm text-amber-700">
                Another invoice from{" "}
                <strong>{duplicate.supplier ?? "this supplier"}</strong> with
                number <strong>#{duplicate.invoiceNumber}</strong> already
                exists at status <strong>{duplicate.status}</strong>. Check
                before posting to avoid double-counting.
              </p>
            </div>
          </div>
        )}

        {/* Math validation banner. */}
        {mathErrors.length > 0 && (
          <div
            data-testid="math-validation-banner"
            className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-red-800">Math mismatch — review before saving</p>
              <ul className="list-disc pl-4 text-sm text-red-700">
                {mathErrors.map((err) => (
                  <li key={err.kind}>{describeMathError(err)}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Confidence legend (shown when any line is low-confidence). */}
        {lines.some((l) => isLowConfidence(l.confidence)) && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            <p className="text-sm text-amber-700">
              Amber rows had low extraction confidence — check them carefully.
            </p>
          </div>
        )}

        {/* General save error. */}
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        {/* Editable header. */}
        <section className="rounded-lg border border-border bg-surface p-5 shadow-resting">
          <h2 className="mb-4 text-sm font-semibold text-text-primary">Header</h2>
          <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
            <EditField
              label="Supplier"
              id="review-supplier"
              value={header.supplier}
              onChange={setHeaderField("supplier")}
            />
            <EditField
              label="Invoice #"
              id="review-invoice-number"
              value={header.invoiceNumber}
              onChange={setHeaderField("invoiceNumber")}
              loading={dupChecking}
            />
            <EditField
              label="PO / order ref"
              id="review-po-ref"
              value={header.poRef}
              onChange={setHeaderField("poRef")}
            />
            <EditField
              label="Issue date"
              id="review-issue-date"
              value={header.issueDate}
              onChange={setHeaderField("issueDate")}
              placeholder="YYYY-MM-DD"
            />
            <EditField
              label="Due date"
              id="review-due-date"
              value={header.dueDate}
              onChange={setHeaderField("dueDate")}
              placeholder="YYYY-MM-DD"
            />
            <EditField
              label="Pre-tax total"
              id="review-pre-tax-total"
              value={header.preTaxTotal}
              onChange={setHeaderField("preTaxTotal")}
              inputMode="decimal"
            />
            <EditField
              label="GST"
              id="review-gst"
              value={header.gst}
              onChange={setHeaderField("gst")}
              inputMode="decimal"
            />
            <EditField
              label="PST"
              id="review-pst"
              value={header.pst}
              onChange={setHeaderField("pst")}
              inputMode="decimal"
            />
            <EditField
              label="Total"
              id="review-total"
              value={header.total}
              onChange={setHeaderField("total")}
              inputMode="decimal"
            />
          </div>
        </section>

        {/* Editable line table. */}
        <section className="overflow-hidden rounded-lg border border-border bg-surface shadow-resting">
          <h2 className="border-b border-border px-5 py-3 text-sm font-semibold text-text-primary">
            Lines ({lines.length})
          </h2>
          {lines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-text-tertiary">
              No lines extracted yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-left text-xs uppercase text-text-tertiary">
                  <tr>
                    <th className="px-3 py-2 font-medium">Qty</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">Unit</th>
                    <th className="px-3 py-2 font-medium">Unit price</th>
                    <th className="px-3 py-2 font-medium">Amount</th>
                    <th className="px-3 py-2 text-center font-medium">PST</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.map((line) => {
                    const lowConf = isLowConfidence(line.confidence);
                    return (
                      <tr
                        key={line.id}
                        data-testid="review-line-row"
                        className={cn(
                          "transition-colors",
                          lowConf && "bg-amber-50"
                        )}
                        title={
                          lowConf
                            ? `Low extraction confidence (${((line.confidence ?? 0) * 100).toFixed(0)}%) — verify this line`
                            : undefined
                        }
                      >
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Line ${line.lineNo} qty`}
                            className="w-14 rounded bg-transparent px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-accent"
                            value={line.qty}
                            onChange={setLineField(line.id, "qty")}
                            inputMode="decimal"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Line ${line.lineNo} SKU`}
                            className="w-24 rounded bg-transparent px-1 py-0.5 font-mono text-xs outline-none focus:ring-1 focus:ring-accent"
                            value={line.sku}
                            onChange={setLineField(line.id, "sku")}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Line ${line.lineNo} description`}
                            className="w-full min-w-[140px] rounded bg-transparent px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-accent"
                            value={line.description}
                            onChange={setLineField(line.id, "description")}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Line ${line.lineNo} unit`}
                            className="w-16 rounded bg-transparent px-1 py-0.5 text-sm outline-none focus:ring-1 focus:ring-accent"
                            value={line.unit}
                            onChange={setLineField(line.id, "unit")}
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Line ${line.lineNo} unit price`}
                            className="w-20 rounded bg-transparent px-1 py-0.5 text-right text-sm outline-none focus:ring-1 focus:ring-accent"
                            value={line.unitPrice}
                            onChange={setLineField(line.id, "unitPrice")}
                            inputMode="decimal"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <input
                            aria-label={`Line ${line.lineNo} amount`}
                            className="w-20 rounded bg-transparent px-1 py-0.5 text-right text-sm outline-none focus:ring-1 focus:ring-accent"
                            value={line.amount}
                            onChange={setLineField(line.id, "amount")}
                            inputMode="decimal"
                          />
                        </td>
                        <td className="px-2 py-1 text-center">
                          <input
                            type="checkbox"
                            aria-label={`Line ${line.lineNo} PST applies`}
                            className="h-4 w-4 rounded border-border accent-accent"
                            checked={line.taxFlag}
                            onChange={setLineField(line.id, "taxFlag")}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Actions. */}
        <div className="flex items-center justify-between">
          <div>
            {mathErrors.length > 0 && (
              <p className="text-xs text-red-600">
                Math mismatch — you can still save, but verify the numbers first.
              </p>
            )}
          </div>
          <button
            type="button"
            data-testid="save-reviewed-btn"
            disabled={saving}
            onClick={() => void handleSave()}
            className="inline-flex items-center gap-2 rounded-lg bg-ink-pill px-5 py-2 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:opacity-60"
          >
            <CheckCircle className="h-4 w-4" />
            {saving ? "Saving…" : "Save as Reviewed"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EditField({
  label,
  id,
  value,
  onChange,
  placeholder,
  inputMode,
  loading,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  loading?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs uppercase text-text-tertiary">
        {label}
        {loading && <span className="ml-1 text-text-tertiary">…</span>}
      </label>
      <input
        id={id}
        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
      />
    </div>
  );
}

function describeMathError(err: MathError): string {
  const fmt = (n: number) => n.toFixed(2);
  switch (err.kind) {
    case "lines_vs_pretax":
      return `Lines sum to $${fmt(err.actual)} but pre-tax total is $${fmt(err.expected)} (difference: $${fmt(Math.abs(err.expected - err.actual))})`;
    case "pretax_plus_tax_vs_total":
      return `Pre-tax + GST + PST = $${fmt(err.actual)} but stated total is $${fmt(err.expected)} (difference: $${fmt(Math.abs(err.expected - err.actual))})`;
  }
}
