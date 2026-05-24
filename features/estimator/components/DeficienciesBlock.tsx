"use client";

import { formatCAD } from "@shared/lib/format";
import { useWorkspaceSettings } from "@shared/lib/workspaceSettings";
import type { DeficienciesState } from "@features/estimator/lib/types";
import { computeDeficienciesCost } from "@features/estimator/lib/totals";

export function DeficienciesBlock({
  deficiencies,
  quotedTotal,
  onUpdate,
}: {
  deficiencies: DeficienciesState;
  quotedTotal: number; // current quoted total before contingency, used for the preview
  onUpdate: (patch: Partial<DeficienciesState>) => void;
}) {
  const { settings } = useWorkspaceSettings();
  const breakdown = computeDeficienciesCost(deficiencies, settings.labourRates);
  const contingencyPreview = (quotedTotal * deficiencies.contingencyPct) / 100;

  return (
    <div className="px-4 py-3 bg-surface space-y-3">
      <p className="text-[11px] text-text-tertiary">
        Keep this small. A predictable hours budget for typical touch-ups plus
        a contingency % on top of the quote for true unknowns.
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
            Touch-up hours budget
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              min={0}
              value={deficiencies.hoursBudget}
              onChange={(e) =>
                onUpdate({ hoursBudget: parseFloat(e.target.value) || 0 })
              }
              className="w-24 text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-1 text-right focus:outline-none focus:border-border-strong"
            />
            <span className="text-[11px] text-text-tertiary">hrs</span>
            <span className="text-[11px] text-text-tertiary ml-2">
              @ install rate ({formatCAD(settings.labourRates.installRate)}/hr)
            </span>
          </div>
          <div className="text-xs text-text-secondary mt-1.5">
            Budget cost: <span className="font-medium tabular-nums">{formatCAD(breakdown.budgetCost)}</span>
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
            Contingency % (on quoted total)
          </div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              max={50}
              value={deficiencies.contingencyPct}
              onChange={(e) =>
                onUpdate({ contingencyPct: parseFloat(e.target.value) || 0 })
              }
              className="w-24 text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-1 text-right focus:outline-none focus:border-border-strong"
            />
            <span className="text-[11px] text-text-tertiary">%</span>
            <span className="text-[11px] text-text-tertiary ml-2">
              of {formatCAD(quotedTotal)} pre-contingency
            </span>
          </div>
          <div className="text-xs text-text-secondary mt-1.5">
            Adds {formatCAD(contingencyPreview)} to quoted price
          </div>
        </div>
      </div>
    </div>
  );
}
