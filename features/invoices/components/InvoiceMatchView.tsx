"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  CheckCircle,
  Building2,
  Briefcase,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Tag,
  Send,
} from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { formatCAD } from "@shared/lib/format";
import { formatError } from "@shared/lib/formatError";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import { saveInvoiceMatch, postInvoice } from "../lib/invoicesData";
import { detectSupplier, suggestJob } from "../lib/invoiceMatch";
import { buildSkuMatches, type LineSkuMatch } from "../lib/catalogPriceUpdate";
import type { Invoice, InvoiceLine } from "../lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Per-line job assignment draft — "shop_stock" is the sentinel for null. */
type LineAssignment = {
  lineId: string;
  jobId: string | null; // null = shop stock
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Slice 4 match panel — appears for `reviewed` invoices. Lets the owner:
 *   1. Confirm (or override) the auto-detected supplier link.
 *   2. Assign each line to a job or mark it "shop stock".
 *
 * Saving writes `invoices.supplier_id` + `invoice_lines.job_id`.
 * Status stays `reviewed`; posting happens in slice 5.
 */
export function InvoiceMatchView({
  invoice,
  lines,
  onSaved,
}: {
  invoice: Invoice;
  lines: InvoiceLine[];
  onSaved: () => void;
}) {
  const { jobs } = useJobs();
  const { suppliers, itemsWithOffers, updateOffer } = useCatalog();

  // ── Supplier state ──────────────────────────────────────────────────────
  // Start from whatever is already persisted; fall back to auto-detect.
  const autoDetect = detectSupplier(invoice.supplier, suppliers);

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(
    () => invoice.supplierId ?? autoDetect.supplier?.id ?? null
  );

  // Update auto-detect suggestion when the suppliers list loads (async).
  useEffect(() => {
    if (!invoice.supplierId) {
      const detected = detectSupplier(invoice.supplier, suppliers);
      if (detected.supplier) {
        setSelectedSupplierId(detected.supplier.id);
      }
    }
  }, [suppliers, invoice.supplier, invoice.supplierId]);

  // ── Line assignments ────────────────────────────────────────────────────
  // Seed from any existing job_id on the line, else try to auto-suggest from PO.
  const autoSuggestedJobId = suggestJob(invoice.poRef, jobs)?.id ?? null;

  const [lineAssignments, setLineAssignments] = useState<LineAssignment[]>(() =>
    lines.map((l) => ({
      lineId: l.id,
      jobId: l.jobId ?? autoSuggestedJobId,
    }))
  );

  // Update auto-suggestions when the jobs list loads (async).
  useEffect(() => {
    const suggested = suggestJob(invoice.poRef, jobs)?.id ?? null;
    setLineAssignments((prev) =>
      prev.map((a) => ({
        ...a,
        // Only auto-fill lines that haven't been touched (still at the seed default).
        jobId: a.jobId ?? suggested,
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, invoice.poRef]);

  // ── Save / Post ───────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await saveInvoiceMatch(invoice.id, selectedSupplierId, lineAssignments);
      onSaved();
    } catch (e) {
      setSaveError(formatError(e));
    } finally {
      setSaving(false);
    }
  }, [invoice.id, selectedSupplierId, lineAssignments, onSaved]);

  // Post commits the current assignments first (so what you see is what posts),
  // then writes job cost actuals with provenance and flips the invoice to posted.
  const handlePost = useCallback(async () => {
    setPosting(true);
    setSaveError(null);
    try {
      await saveInvoiceMatch(invoice.id, selectedSupplierId, lineAssignments);
      await postInvoice(invoice.id);
      onSaved();
    } catch (e) {
      setSaveError(formatError(e));
    } finally {
      setPosting(false);
    }
  }, [invoice.id, selectedSupplierId, lineAssignments, onSaved]);

  const assignedLineCount = lineAssignments.filter((a) => a.jobId !== null).length;

  const setLineJob = useCallback((lineId: string, jobId: string | null) => {
    setLineAssignments((prev) => prev.map((a) => (a.lineId === lineId ? { ...a, jobId } : a)));
  }, []);

  // ── Slice 6: catalog price update (SKU match → delta → import) ───────────────
  // Match each line's product-no to a catalog offer, scoped to the linked
  // supplier when one is chosen (a SKU can recur across vendors). Door/matrix
  // items are excluded inside buildSkuMatches (no SKUs — New Surrey).
  const skuMatches = useMemo(
    () => buildSkuMatches(lines, itemsWithOffers, { preferSupplierId: selectedSupplierId }),
    [lines, itemsWithOffers, selectedSupplierId]
  );
  // Only lines that carry a SKU surface in the price-update panel; those with a
  // match offer a one-click reprice, those without fall back to manual handling.
  const skuLines = useMemo(() => skuMatches.filter((m) => m.lineSku), [skuMatches]);
  const updatableMatches = useMemo(
    () => skuMatches.filter((m) => m.matched && m.update && m.update.direction !== "flat"),
    [skuMatches]
  );

  // Offers already repriced this session (so the button reads "Updated").
  const [appliedOfferIds, setAppliedOfferIds] = useState<Set<string>>(new Set());

  const applyPriceUpdate = useCallback(
    (match: LineSkuMatch) => {
      if (!match.offer || !match.update) return;
      // Reuse the catalog store path: update the offer price + log history with
      // source "import" (not "manual") so the audit trail shows the bill drove it.
      updateOffer(match.offer.id, { unitPrice: match.update.newPrice }, { priceSource: "import" });
      setAppliedOfferIds((prev) => new Set(prev).add(match.offer!.id));
    },
    [updateOffer]
  );

  // Helpers
  const selectedSupplier = suppliers.find((s) => s.id === selectedSupplierId) ?? null;
  const autoDetectResult = detectSupplier(invoice.supplier, suppliers);

  return (
    <div className="min-h-screen" data-testid="invoice-match-view">
      <PageHeader
        eyebrow="Invoice"
        title={invoice.supplier ?? invoice.originalFilename ?? "Match invoice"}
        subtitle="Assign this invoice to a supplier and map each line to a job."
      />

      <div className="space-y-6 px-8 pb-12">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft className="h-4 w-4" /> All invoices
        </Link>

        {saveError && (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {saveError}
          </p>
        )}

        {/* ── Supplier section ──────────────────────────────────────────── */}
        <section
          className="rounded-lg border border-border bg-surface p-5 shadow-resting"
          data-testid="supplier-section"
        >
          <div className="mb-4 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">Supplier</h2>
          </div>

          {/* Auto-detect badge */}
          {autoDetectResult.matchKind !== "none" && (
            <p className="mb-3 text-xs text-text-secondary">
              Auto-detected from &ldquo;{invoice.supplier}&rdquo; —{" "}
              <span className="font-medium">
                {autoDetectResult.matchKind === "exact" ? "exact match" : "partial match"}
              </span>
            </p>
          )}
          {autoDetectResult.matchKind === "none" && invoice.supplier && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
              <p className="text-xs text-amber-700">
                No catalog supplier matched &ldquo;{invoice.supplier}&rdquo;. Select one below or
                leave unlinked.
              </p>
            </div>
          )}

          <div>
            <label
              htmlFor="supplier-picker"
              className="mb-1 block text-xs uppercase text-text-tertiary"
            >
              Link to catalog supplier
            </label>
            <select
              id="supplier-picker"
              data-testid="supplier-picker"
              aria-label="Link to catalog supplier"
              value={selectedSupplierId ?? ""}
              onChange={(e) => setSelectedSupplierId(e.target.value || null)}
              className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent sm:max-w-xs"
            >
              <option value="">— Not linked (unresolved) —</option>
              {suppliers
                .filter((s) => s.active !== false)
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
            {selectedSupplier && (
              <p className="mt-1 text-xs text-text-tertiary">
                Linked to <strong>{selectedSupplier.name}</strong>
                {selectedSupplier.website ? (
                  <>
                    {" "}
                    &middot;{" "}
                    <a
                      href={selectedSupplier.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent hover:underline"
                    >
                      {selectedSupplier.website}
                    </a>
                  </>
                ) : null}
              </p>
            )}
          </div>
        </section>

        {/* ── Lines section ─────────────────────────────────────────────── */}
        <section
          className="overflow-hidden rounded-lg border border-border bg-surface shadow-resting"
          data-testid="line-assignments-section"
        >
          <div className="flex items-center gap-2 border-b border-border px-5 py-3">
            <Briefcase className="h-4 w-4 text-text-tertiary" />
            <h2 className="text-sm font-semibold text-text-primary">
              Lines — job assignment ({lines.length})
            </h2>
          </div>

          {lines.length === 0 ? (
            <p className="px-5 py-4 text-sm text-text-tertiary">No lines — run extraction first.</p>
          ) : (
            <div className="divide-y divide-border">
              {lines.map((line, idx) => {
                const assignment = lineAssignments.find((a) => a.lineId === line.id);
                const assignedJobId = assignment?.jobId ?? null;
                const assignedJob = jobs.find((j) => j.id === assignedJobId) ?? null;

                return (
                  <div
                    key={line.id}
                    data-testid="line-assignment-row"
                    className="flex flex-wrap items-start gap-3 px-5 py-3 sm:flex-nowrap"
                  >
                    {/* Line summary */}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text-primary">
                        <span className="mr-1 text-text-tertiary">{idx + 1}.</span>
                        {line.description ?? "—"}
                        {line.sku && (
                          <span className="ml-1.5 font-mono text-xs text-text-tertiary">
                            [{line.sku}]
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-text-tertiary">
                        {line.qty != null ? `${line.qty} ${line.unit ?? ""}` : ""}{" "}
                        {line.amount != null ? formatCAD(line.amount) : ""}
                      </p>
                    </div>

                    {/* Job picker */}
                    <div className="w-full sm:w-56">
                      <select
                        aria-label={`Line ${line.lineNo} job assignment`}
                        data-testid={`line-job-picker-${idx}`}
                        value={assignedJobId ?? ""}
                        onChange={(e) => setLineJob(line.id, e.target.value || null)}
                        className="w-full rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-text-primary outline-none transition-colors focus:border-accent focus:ring-1 focus:ring-accent"
                      >
                        <option value="">Shop stock / no job</option>
                        {jobs
                          .filter(
                            (j) => j.pipelineStatus !== "complete" && j.pipelineStatus !== "new"
                          )
                          .sort((a, b) => a.code.localeCompare(b.code))
                          .map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.code} — {j.name}
                            </option>
                          ))}
                        {/* Show all jobs in a divider group as fallback */}
                        <option disabled>── All jobs ──</option>
                        {jobs
                          .filter(
                            (j) => j.pipelineStatus === "complete" || j.pipelineStatus === "new"
                          )
                          .sort((a, b) => a.code.localeCompare(b.code))
                          .map((j) => (
                            <option key={j.id} value={j.id}>
                              {j.code} — {j.name}
                            </option>
                          ))}
                      </select>
                      {assignedJob && (
                        <p className="mt-0.5 truncate text-xs text-text-tertiary">
                          {assignedJob.client}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── Catalog price updates (slice 6) ───────────────────────────── */}
        {skuLines.length > 0 && (
          <section
            className="overflow-hidden rounded-lg border border-border bg-surface shadow-resting"
            data-testid="price-update-section"
          >
            <div className="flex items-center gap-2 border-b border-border px-5 py-3">
              <Tag className="h-4 w-4 text-text-tertiary" />
              <h2 className="text-sm font-semibold text-text-primary">
                Catalog price updates ({updatableMatches.length})
              </h2>
            </div>

            <div className="divide-y divide-border">
              {skuLines.map((match) => (
                <PriceUpdateRow
                  key={match.lineId}
                  match={match}
                  applied={match.offer ? appliedOfferIds.has(match.offer.id) : false}
                  onApply={() => applyPriceUpdate(match)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="save-match-btn"
              disabled={saving || posting}
              onClick={() => void handleSave()}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-5 py-2 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-muted disabled:opacity-60"
            >
              <CheckCircle className="h-4 w-4" />
              {saving ? "Saving…" : "Save assignments"}
            </button>
            <button
              type="button"
              data-testid="post-actuals-btn"
              disabled={saving || posting}
              onClick={() => void handlePost()}
              className="inline-flex items-center gap-2 rounded-lg bg-ink-pill px-5 py-2 text-sm font-medium text-white transition-colors duration-fast hover:opacity-90 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {posting ? "Posting…" : "Post to actuals"}
            </button>
          </div>
          <p className="text-xs text-text-tertiary">
            {assignedLineCount > 0
              ? `Posts ${assignedLineCount} assigned ${assignedLineCount === 1 ? "line" : "lines"} to job actuals (pre-tax) and marks this invoice posted.`
              : "No lines assigned to a job — posting will mark this invoice posted without writing any actuals."}
          </p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Price-update row (slice 6)
// ---------------------------------------------------------------------------

/**
 * One SKU line in the catalog price-update panel. A matched line shows the
 * old → new offer-price delta with a re-quote nudge on a large jump and a
 * one-click "Apply price update" (writes the offer + import history). An
 * unmatched line states it has no catalog match and falls back to manual
 * assignment via the Materials book.
 */
function PriceUpdateRow({
  match,
  applied,
  onApply,
}: {
  match: LineSkuMatch;
  applied: boolean;
  onApply: () => void;
}) {
  // Unmatched SKU — nothing to update automatically.
  if (!match.matched || !match.offer || !match.update) {
    return (
      <div
        data-testid="price-update-row"
        className="flex flex-wrap items-center gap-3 px-5 py-3 sm:flex-nowrap"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-text-primary">
            <span className="font-mono text-xs text-text-tertiary">[{match.lineSku}]</span>
          </p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          No catalog match — assign by hand
        </p>
      </div>
    );
  }

  const { update } = match;
  const up = update.direction === "up";
  const flat = update.direction === "flat";
  const Arrow = up ? TrendingUp : TrendingDown;
  const pctLabel =
    update.deltaPct === null
      ? "new"
      : `${update.deltaPct > 0 ? "+" : ""}${update.deltaPct.toFixed(1)}%`;

  return (
    <div
      data-testid="price-update-row"
      data-large-jump={update.isLargeJump ? "true" : "false"}
      className="flex flex-wrap items-start gap-3 px-5 py-3 sm:flex-nowrap"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">
          {match.itemName}
          <span className="ml-1.5 font-mono text-xs text-text-tertiary">[{match.lineSku}]</span>
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-text-tertiary">
          <span>{formatCAD(update.oldPrice)}</span>
          <span aria-hidden>→</span>
          <span className="font-medium text-text-primary">{formatCAD(update.newPrice)}</span>
          {match.itemUnit ? <span>/ {match.itemUnit}</span> : null}
          {!flat && (
            <span
              className={`inline-flex items-center gap-0.5 font-medium ${
                up ? "text-red-600" : "text-emerald-600"
              }`}
            >
              <Arrow className="h-3 w-3" />
              {pctLabel}
            </span>
          )}
        </p>
        {update.isLargeJump && !applied && (
          <p
            data-testid="price-jump-nudge"
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-700"
          >
            <AlertTriangle className="h-3 w-3 shrink-0" />
            Large move — worth a re-quote
          </p>
        )}
      </div>

      <div className="w-full sm:w-auto">
        {/* `applied` is checked before `flat`: once accepted, the offer reprices
            to match the line so the recomputed delta reads flat — but the row
            must still confirm the update landed, not "already up to date". */}
        {applied ? (
          <span
            data-testid="price-update-applied"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700"
          >
            <CheckCircle className="h-4 w-4" />
            Updated
          </span>
        ) : flat ? (
          <span className="inline-flex items-center gap-1.5 px-1 text-xs text-text-tertiary">
            <CheckCircle className="h-3.5 w-3.5" />
            Catalog price up to date
          </span>
        ) : (
          <button
            type="button"
            data-testid="apply-price-update-btn"
            onClick={onApply}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors duration-fast hover:bg-surface-muted"
          >
            <Tag className="h-4 w-4" />
            Apply price update
          </button>
        )}
      </div>
    </div>
  );
}
