"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import { summarizeProject } from "../lib/sqft";
import { priceOrder } from "../lib/pricing";
import { lookupBaseRate } from "../lib/newSurreyPriceBook";
import { ELEMENT_KINDS, ELEMENT_KIND_LABELS, type RefaceProject } from "../lib/types";
import { formatCAD, formatCADPrecise } from "@shared/lib/format";

/** Live counts + sqft per kind + the costed New Surrey door order. */
export function SummaryPanel({ project }: { project: RefaceProject }) {
  const summary = useMemo(() => summarizeProject(project), [project]);
  const quote = useMemo(() => priceOrder(project), [project]);
  const baseRate = useMemo(() => lookupBaseRate(project.orderSettings), [project.orderSettings]);

  const missingDims = quote.lines.filter((l) => l.sqft === 0).length;

  return (
    <div className="rounded-xl border border-border bg-surface shadow-resting overflow-hidden">
      <div className="px-4 py-3 border-b border-border-faint bg-surface-muted/60">
        <h3 className="font-serif text-title text-text-primary">Summary</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* Counts + sqft per kind */}
        <div className="space-y-1.5">
          {ELEMENT_KINDS.map((kind) => {
            const r = summary.byKind[kind];
            return (
              <div key={kind} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">{ELEMENT_KIND_LABELS[kind]}</span>
                <span className="text-text-tertiary">
                  <span className="font-mono text-text-primary">{r.count}</span>
                  {r.sqft > 0 && <span className="ml-2 font-mono">{r.sqft.toFixed(2)} sq ft</span>}
                </span>
              </div>
            );
          })}
          <div className="flex items-center justify-between text-sm pt-1.5 border-t border-border-faint">
            <span className="font-medium text-text-primary">Total</span>
            <span className="text-text-tertiary">
              <span className="font-mono text-text-primary">{summary.totalCount}</span>
              <span className="ml-2 font-mono font-medium text-text-primary">
                {summary.totalSqft.toFixed(2)} sq ft
              </span>
            </span>
          </div>
        </div>

        {/* Costed door order */}
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-label uppercase text-text-tertiary">
            <span>Door order (New Surrey)</span>
            {baseRate !== null && (
              <span className="normal-case">{formatCADPrecise(baseRate)}/sq ft</span>
            )}
          </div>

          {!project.orderSettings.woodSpecies && !project.orderSettings.doorStyle ? (
            <p className="text-caption text-text-tertiary">
              Set the product spec below to cost the order.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Subtotal</span>
                <span className="font-mono text-text-primary">{formatCAD(quote.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">Shipping</span>
                <span className="font-mono text-text-primary">
                  {quote.shippingCost > 0 ? formatCAD(quote.shippingCost) : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between text-base pt-1.5 border-t border-border-faint">
                <span className="font-medium text-text-primary">Order total</span>
                <span className="font-mono font-semibold text-text-primary">
                  {formatCAD(quote.total)}
                </span>
              </div>
            </>
          )}

          {(quote.hasUnpriced || missingDims > 0) && (
            <div className="flex items-start gap-1.5 text-caption text-status-at-risk pt-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={2} />
              <span>
                {quote.hasUnpriced && "Some doors have no price for the chosen spec. "}
                {missingDims > 0 && `${missingDims} door/drawer still missing dimensions.`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
