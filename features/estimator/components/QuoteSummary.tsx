"use client";

import { ArrowRight } from "lucide-react";
import { formatCAD, formatPct } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { EstimateTotals } from "@features/estimator/lib/totals";
import type { Room } from "@features/estimator/lib/types";
import { SummaryRow } from "./inputs";

export function QuoteSummary({
  totals,
  overheadPct,
  contingencyPct,
  preworkCost,
  preworkHours,
  rooms,
  canSave,
  submitting,
  onSave,
  capacityWarning,
}: {
  totals: EstimateTotals;
  overheadPct: number;
  contingencyPct: number;
  preworkCost: number;
  preworkHours: number;
  rooms: Room[];
  canSave: boolean;
  submitting: boolean;
  onSave: () => void;
  /**
   * S16 — capacity warning from the scheduling engine. Displayed as an
   * amber advisory below the quoted price when a work-center is near/over
   * capacity this week. Absent when scheduling is off or all phases have room.
   */
  capacityWarning?: string | null;
}) {
  // Per-room rollups for any active rooms with non-zero contribution.
  const namedRooms = rooms.map((r) => ({
    ...r,
    stats: totals.perRoom[r.id] ?? { cost: 0, price: 0, lineCount: 0 },
  }));
  const hasRooms = namedRooms.length > 0;

  return (
    <aside className="lg:sticky lg:top-6 self-start space-y-4">
      <div className="bg-surface border border-border rounded-lg p-5">
        <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">
          Quote summary
        </h3>
        <SummaryRow label="Materials" value={formatCAD(totals.costs.materials)} />
        <SummaryRow label="Labour" value={formatCAD(totals.costs.labour)} />
        <SummaryRow label="Direct cost" value={formatCAD(totals.costs.direct)} />
        <SummaryRow label={`Overhead (${overheadPct}%)`} value={formatCAD(totals.overhead)} muted />
        <div className="border-t border-border my-3" />
        <SummaryRow label="Total cost (quoted)" value={formatCAD(totals.totalCost)} />
        <SummaryRow
          label={`Markup (${formatPct(totals.effectiveMarginPct)} margin)`}
          value={formatCAD(totals.markupTotal)}
          muted
        />
        {contingencyPct > 0 && (
          <SummaryRow
            label={`Contingency (${contingencyPct}%)`}
            value={formatCAD(totals.contingency)}
            muted
          />
        )}
        <div className="border-t border-border my-3" />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-text-primary">Quoted price</span>
          <span className="text-xl font-semibold tabular-nums text-accent">
            {formatCAD(totals.quoted)}
          </span>
        </div>
        {(preworkCost > 0 || contingencyPct > 0) && (
          <div className="mt-3 pt-3 border-t border-border space-y-1">
            {preworkCost > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-tertiary">Pre-work (internal — not on quote)</span>
                <span className="tabular-nums text-text-secondary">
                  {preworkHours.toFixed(2)}h · {formatCAD(preworkCost)}
                </span>
              </div>
            )}
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-tertiary">True cost (incl. pre-work + contingency)</span>
              <span className="tabular-nums text-text-secondary font-medium">
                {formatCAD(totals.internalCost)}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-text-tertiary">Net (contingency consumed)</span>
              <span
                className={cn(
                  "tabular-nums font-medium",
                  totals.quoted - totals.internalCost >= 0
                    ? "text-status-on-track"
                    : "text-status-blocked"
                )}
              >
                {formatCAD(totals.quoted - totals.internalCost)}
              </span>
            </div>
            {contingencyPct > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-text-tertiary">Net (contingency unused — upside)</span>
                <span className="tabular-nums text-status-on-track">
                  {formatCAD(totals.quoted - totals.internalCost + totals.contingency)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {hasRooms && (
        <div className="bg-surface border border-border rounded-lg p-4">
          <h3 className="text-xs uppercase tracking-[0.06em] text-text-tertiary mb-3">By room</h3>
          {namedRooms.map((r) => (
            <div
              key={r.id}
              className={cn(
                "flex items-center justify-between text-sm py-1",
                !r.enabled && "opacity-50 line-through"
              )}
            >
              <span className="text-text-secondary">{r.name}</span>
              <span className="tabular-nums text-text-primary font-medium">
                {formatCAD(r.stats.price)}
              </span>
            </div>
          ))}
        </div>
      )}

      {capacityWarning && (
        <div
          data-testid="estimator-capacity-warning"
          className="rounded-2xl border border-status-at-risk-soft bg-status-at-risk-soft/40 p-3"
        >
          <p className="text-xs text-status-at-risk leading-relaxed">{capacityWarning}</p>
        </div>
      )}

      <button
        onClick={onSave}
        disabled={!canSave || submitting}
        className={cn(
          "w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium transition-colors duration-fast",
          "bg-ink-pill text-white hover:bg-accent-active",
          "disabled:bg-text-disabled disabled:cursor-not-allowed"
        )}
      >
        {submitting ? "Creating job…" : "Save as Job"}
        <ArrowRight className="h-4 w-4" strokeWidth={1.75} />
      </button>

      <p className="text-caption text-text-tertiary leading-relaxed px-1">
        Saving creates a job in pipeline stage Sold with these costs and the quoted price as
        revenue. Pre-work is stored as a separate cost bucket so margin reports can show true
        profit.
      </p>
    </aside>
  );
}
