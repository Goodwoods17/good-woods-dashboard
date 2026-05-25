"use client";

import {
  CABINET_TYPES,
  CABINET_TYPE_LABELS,
  totalCabinetCount,
  totalCabinetLinearFt,
  type CabinetSummary as CabinetSummaryT,
  type CabinetTypeId,
  type Room,
} from "@features/estimator/lib/types";
import { NumberInput, Sub } from "./inputs";

export function CabinetSummary({
  summary,
  rooms = [],
  onUpdate,
}: {
  summary: CabinetSummaryT;
  rooms?: Room[];
  onUpdate: (patch: Partial<CabinetSummaryT>) => void;
}) {
  const totalCabs = totalCabinetCount(summary);
  const totalLf = totalCabinetLinearFt(summary);

  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="text-sm font-semibold text-text-primary">Cabinet summary</h2>
        <span className="text-xs text-text-tertiary">
          Drives Assembly and Install hours (per-type minutes × counts).
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
        {CABINET_TYPES.map((type) => (
          <CabinetRow
            key={type}
            label={CABINET_TYPE_LABELS[type]}
            count={summary[type].count}
            linearFt={summary[type].linearFt}
            roomId={summary[type].roomId}
            rooms={rooms}
            onCount={(count) =>
              onUpdate({ [type]: { ...summary[type], count } } as Partial<CabinetSummaryT>)
            }
            onLinearFt={(linearFt) =>
              onUpdate({ [type]: { ...summary[type], linearFt } } as Partial<CabinetSummaryT>)
            }
            onRoom={(roomId) =>
              onUpdate({ [type]: { ...summary[type], roomId } } as Partial<CabinetSummaryT>)
            }
          />
        ))}
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
          <div className="text-micro uppercase tracking-wider text-text-tertiary mb-1">
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
  roomId,
  rooms,
  onCount,
  onLinearFt,
  onRoom,
}: {
  label: string;
  count: number;
  linearFt: number;
  roomId?: string;
  rooms: Room[];
  onCount: (v: number) => void;
  onLinearFt: (v: number) => void;
  onRoom: (roomId: string | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-micro uppercase tracking-wider text-text-tertiary">
        {label}
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div>
          <NumberInput value={count} step="1" onChange={onCount} />
          <div className="text-micro text-text-tertiary mt-0.5">cabs</div>
        </div>
        <div>
          <NumberInput value={linearFt} onChange={onLinearFt} />
          <div className="text-micro text-text-tertiary mt-0.5">Ft</div>
        </div>
      </div>
      {rooms.length > 0 && (
        <div>
          <select
            value={roomId ?? ""}
            onChange={(e) => onRoom(e.target.value || undefined)}
            className="w-full text-caption px-1.5 py-1 border border-border rounded bg-surface text-text-primary focus:outline-none focus:ring-1 focus:ring-accent focus:border-accent"
          >
            <option value="">— whole job —</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
