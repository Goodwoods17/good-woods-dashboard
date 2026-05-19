"use client";

import { ArrowRight } from "lucide-react";
import { formatCAD, formatPct } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { EstimateTotals } from "@features/estimator/lib/totals";
import { SummaryRow } from "./inputs";

export function QuoteSummary({
  totals,
  overheadPct,
  canSave,
  submitting,
  onSave,
}: {
  totals: EstimateTotals;
  overheadPct: number;
  canSave: boolean;
  submitting: boolean;
  onSave: () => void;
}) {
  return (
    <aside className="lg:sticky lg:top-6 self-start space-y-4">
      <div className="bg-surface border border-border rounded-lg p-5">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Quote summary
        </h3>
        <SummaryRow label="Materials" value={formatCAD(totals.costs.materials)} />
        <SummaryRow label="Labour" value={formatCAD(totals.costs.labour)} />
        <SummaryRow label="Direct cost" value={formatCAD(totals.costs.direct)} />
        <SummaryRow
          label={`Overhead (${overheadPct}%)`}
          value={formatCAD(totals.overhead)}
          muted
        />
        <div className="border-t border-border my-3" />
        <SummaryRow label="Total cost" value={formatCAD(totals.totalCost)} />
        <SummaryRow
          label={`Markup (${formatPct(totals.effectiveMarginPct)} margin)`}
          value={formatCAD(totals.markupTotal)}
          muted
        />
        <div className="border-t border-border my-3" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">Quoted price</span>
          <span className="text-xl font-semibold tabular-nums text-accent">
            {formatCAD(totals.quoted)}
          </span>
        </div>
      </div>

      <button
        onClick={onSave}
        disabled={!canSave || submitting}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-colors duration-fast",
          "bg-accent text-white hover:bg-accent-hover active:bg-accent-active",
          "disabled:bg-text-disabled disabled:cursor-not-allowed"
        )}
      >
        {submitting ? "Creating job…" : "Save as Job"}
        <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <p className="text-[11px] text-text-tertiary leading-relaxed px-1">
        Saving creates a job in pipeline stage Sold with these costs and the quoted
        price as revenue. You can adjust everything from the job detail.
      </p>
    </aside>
  );
}
