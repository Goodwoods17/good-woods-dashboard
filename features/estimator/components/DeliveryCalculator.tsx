"use client";

import { formatCAD } from "@shared/lib/format";
import { useWorkspaceSettings } from "@shared/lib/workspaceSettings";
import type { CabinetSummary, DeliveryState } from "@features/estimator/lib/types";
import { totalCabinetCount } from "@features/estimator/lib/types";
import { computeDeliveryCost } from "@features/estimator/lib/totals";

export function DeliveryCalculator({
  delivery,
  cabinetSummary,
  onUpdate,
}: {
  delivery: DeliveryState;
  cabinetSummary: CabinetSummary;
  onUpdate: (patch: Partial<DeliveryState>) => void;
}) {
  const { settings } = useWorkspaceSettings();
  const cabCount = totalCabinetCount(cabinetSummary);
  const breakdown = computeDeliveryCost(delivery, cabCount, settings.labourRates);

  return (
    <div className="px-4 py-3 bg-surface space-y-3">
      <p className="text-[11px] text-text-tertiary">
        Gas + travel time + loading time. Travel runs at install rate
        ({formatCAD(settings.labourRates.installRate)}/hr), loading at shop rate
        ({formatCAD(settings.labourRates.shopRate)}/hr).
      </p>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Field label="Miles (one way)">
          <input
            type="number"
            inputMode="decimal"
            step="0.5"
            min={0}
            value={delivery.miles}
            onChange={(e) =>
              onUpdate({ miles: parseFloat(e.target.value) || 0 })
            }
            className="w-full text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-1 text-right focus:outline-none focus:border-border-strong"
          />
          <div className="text-[10px] text-text-tertiary mt-0.5">
            Round trip = {(delivery.miles * 2).toFixed(1)} mi · gas ${" "}
            {breakdown.gasCost.toFixed(2)}
          </div>
        </Field>
        <Field label="Travel time (round trip)">
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.25"
              min={0}
              value={delivery.travelHours}
              onChange={(e) =>
                onUpdate({ travelHours: parseFloat(e.target.value) || 0 })
              }
              className="w-full text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-1 text-right focus:outline-none focus:border-border-strong"
            />
            <span className="text-[11px] text-text-tertiary">hrs</span>
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            Travel labour {formatCAD(breakdown.travelCost)}
          </div>
        </Field>
        <Field label={`Loading time (${cabCount} cabinets)`}>
          <div className="flex items-center gap-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              min={0}
              value={delivery.loadMinutesPerCabinet}
              onChange={(e) =>
                onUpdate({
                  loadMinutesPerCabinet: parseFloat(e.target.value) || 0,
                })
              }
              className="w-full text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-1 text-right focus:outline-none focus:border-border-strong"
            />
            <span className="text-[11px] text-text-tertiary">min/cab</span>
          </div>
          <div className="text-[10px] text-text-tertiary mt-0.5">
            {breakdown.loadingHours.toFixed(2)} hrs ·{" "}
            {formatCAD(breakdown.loadingCost)}
          </div>
        </Field>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 pt-2 border-t border-border/40 items-end">
        <Field label="Gas rate (override)">
          <div className="flex items-center gap-1">
            <span className="text-[11px] text-text-tertiary">$</span>
            <input
              type="number"
              inputMode="decimal"
              step="0.05"
              min={0}
              value={delivery.gasRatePerMile}
              onChange={(e) =>
                onUpdate({
                  gasRatePerMile: parseFloat(e.target.value) || 0,
                })
              }
              className="w-full text-sm tabular-nums bg-surface-muted border border-border rounded-md px-2 py-1 text-right focus:outline-none focus:border-border-strong"
            />
            <span className="text-[11px] text-text-tertiary">/ mile</span>
          </div>
        </Field>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
            Delivery total
          </div>
          <div className="text-lg font-semibold tabular-nums text-accent">
            {formatCAD(breakdown.total)}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
