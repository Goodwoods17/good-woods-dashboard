"use client";

import {
  totalCabinetCount,
  totalCabinetLinearFt,
  type CabinetSummary as CabinetSummaryT,
} from "@features/estimator/lib/types";
import { NumberInput, Sub } from "./inputs";

export function CabinetSummary({
  summary,
  onUpdate,
}: {
  summary: CabinetSummaryT;
  onUpdate: (patch: Partial<CabinetSummaryT>) => void;
}) {
  const totalCabs = totalCabinetCount(summary);
  const totalLf = totalCabinetLinearFt(summary);

  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold text-text-primary">Cabinet summary</h2>
        <span className="text-xs text-text-tertiary">
          Info only — feeds metrics like $ per linear foot in future reports.
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4 mt-3">
        <CabinetRow
          label="Base"
          count={summary.base.count}
          linearFt={summary.base.linearFt}
          onCount={(count) =>
            onUpdate({ base: { ...summary.base, count } })
          }
          onLinearFt={(linearFt) =>
            onUpdate({ base: { ...summary.base, linearFt } })
          }
        />
        <CabinetRow
          label="Wall"
          count={summary.wall.count}
          linearFt={summary.wall.linearFt}
          onCount={(count) =>
            onUpdate({ wall: { ...summary.wall, count } })
          }
          onLinearFt={(linearFt) =>
            onUpdate({ wall: { ...summary.wall, linearFt } })
          }
        />
        <CabinetRow
          label="Tall"
          count={summary.tall.count}
          linearFt={summary.tall.linearFt}
          onCount={(count) =>
            onUpdate({ tall: { ...summary.tall, count } })
          }
          onLinearFt={(linearFt) =>
            onUpdate({ tall: { ...summary.tall, linearFt } })
          }
        />
      </div>

      <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-border">
        <Sub label="# Pulls">
          <NumberInput
            value={summary.pulls}
            step="1"
            onChange={(v) => onUpdate({ pulls: v })}
          />
        </Sub>
        <Sub label="Room Ft (optional)">
          <NumberInput
            value={summary.roomLinearFt ?? 0}
            onChange={(v) => onUpdate({ roomLinearFt: v })}
          />
        </Sub>
        <div className="self-end">
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary mb-1">
            Total cabinet Ft
          </div>
          <div className="text-lg font-semibold tabular-nums text-text-primary">
            {totalLf.toFixed(2)}{" "}
            <span className="text-xs font-normal text-text-tertiary">
              ({totalCabs} cabinets)
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CabinetRow({
  label,
  count,
  linearFt,
  onCount,
  onLinearFt,
}: {
  label: string;
  count: number;
  linearFt: number;
  onCount: (v: number) => void;
  onLinearFt: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <NumberInput value={count} step="1" onChange={onCount} />
          <div className="text-[10px] text-text-tertiary mt-0.5">cabs</div>
        </div>
        <div>
          <NumberInput value={linearFt} onChange={onLinearFt} />
          <div className="text-[10px] text-text-tertiary mt-0.5">Ft</div>
        </div>
      </div>
    </div>
  );
}
