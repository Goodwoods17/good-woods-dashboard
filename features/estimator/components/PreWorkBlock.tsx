"use client";

import { formatCAD } from "@shared/lib/format";
import { useWorkspaceSettings } from "@shared/lib/workspaceSettings";
import {
  PRE_WORK_SLOT_LABELS,
  type PreWorkSlotId,
  type PreWorkState,
} from "@features/estimator/lib/types";
import { computePreWorkCost } from "@features/estimator/lib/totals";

const SLOT_IDS = Object.keys(PRE_WORK_SLOT_LABELS) as PreWorkSlotId[];

export function PreWorkBlock({
  prework,
  onUpdate,
}: {
  prework: PreWorkState;
  onUpdate: (next: PreWorkState) => void;
}) {
  const { settings } = useWorkspaceSettings();
  const breakdown = computePreWorkCost(prework, settings.labourRates);

  function setHours(id: PreWorkSlotId, hours: number) {
    onUpdate({ ...prework, [id]: { ...prework[id], hours } });
  }
  function setNote(id: PreWorkSlotId, note: string) {
    onUpdate({ ...prework, [id]: { ...prework[id], note } });
  }

  return (
    <div className="px-4 py-3 bg-surface space-y-2">
      <p className="text-[11px] text-text-tertiary">
        Time spent before the build starts. Tracked internally for margin
        awareness — does <strong>not</strong> appear on the client quote. Priced
        at the workspace design rate ({formatCAD(settings.labourRates.designRate)}/hr).
      </p>
      <div className="space-y-1.5">
        {SLOT_IDS.map((id) => {
          const slot = prework[id];
          const cost = breakdown.perSlot[id].cost;
          return (
            <div
              key={id}
              className="grid items-center gap-2 px-2 py-1 rounded-md hover:bg-surface-muted/40 transition-colors duration-fast"
              style={{
                gridTemplateColumns: "13rem 5rem 1fr 6.5rem",
              }}
            >
              <span className="text-sm text-text-primary">
                {PRE_WORK_SLOT_LABELS[id]}
              </span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  inputMode="decimal"
                  value={slot.hours}
                  step="0.25"
                  min={0}
                  onChange={(e) =>
                    setHours(id, parseFloat(e.target.value) || 0)
                  }
                  className="w-full text-sm tabular-nums bg-surface-muted border border-border rounded-md px-1.5 py-1 text-right focus:outline-none focus:border-border-strong"
                />
                <span className="text-[11px] text-text-tertiary">hrs</span>
              </div>
              <input
                type="text"
                placeholder="Optional note (e.g. 2 design meetings)"
                value={slot.note ?? ""}
                onChange={(e) => setNote(id, e.target.value)}
                className="text-sm bg-surface-muted border border-border rounded-md px-2 py-1 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong"
              />
              <span
                className={
                  cost > 0
                    ? "text-right text-sm tabular-nums text-text-secondary font-medium"
                    : "text-right text-sm tabular-nums text-text-tertiary"
                }
              >
                {formatCAD(cost)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-border/40 pt-2 mt-1 px-2">
        <span className="text-xs text-text-tertiary">
          Internal cost — not on quote
        </span>
        <span className="text-sm font-semibold tabular-nums text-text-primary">
          {breakdown.totalHours.toFixed(2)} hrs · {formatCAD(breakdown.totalCost)}
        </span>
      </div>
    </div>
  );
}
