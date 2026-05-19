"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { AlertOctagon, Plus } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { cn } from "@shared/lib/utils";
import {
  useShop,
  WORK_STATIONS,
  type WorkStation,
} from "@features/shop/lib/shopStore";
import { AndonBanner } from "./AndonBanner";
import { ShopColumn } from "./ShopColumn";
import { NewUnitModal } from "./NewUnitModal";
import { AndonModal } from "./AndonModal";

export function ShopBoard() {
  const { units, andon, moveUnit, addUnit, removeUnit, raiseAndon, resolveAndon } =
    useShop();
  const [showAdd, setShowAdd] = useState(false);
  const [showAndon, setShowAndon] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<WorkStation, typeof units>();
    WORK_STATIONS.forEach((s) => map.set(s.key, []));
    for (const u of units) {
      const list = map.get(u.station);
      if (list) list.push(u);
    }
    return map;
  }, [units]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  function handleDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const target = WORK_STATIONS.find((s) => s.key === over.id);
    if (!target) return;
    moveUnit(String(active.id), target.key);
  }

  const activeAndon = andon.filter((a) => !a.resolvedAt);

  return (
    <>
      <PageHeader
        eyebrow="Lean Tracker"
        title="Shop floor"
        subtitle="Work units flowing through stations. WIP limits enforced visually."
        actions={
          <>
            <button
              onClick={() => setShowAndon(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors duration-fast",
                activeAndon.length > 0
                  ? "border-status-andon bg-status-andon-soft text-status-andon"
                  : "border-border bg-surface text-text-secondary hover:border-status-andon hover:text-status-andon"
              )}
            >
              <AlertOctagon className="h-3.5 w-3.5" strokeWidth={2} />
              Andon{activeAndon.length > 0 ? ` (${activeAndon.length})` : ""}
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="inline-flex items-center gap-1.5 rounded-md bg-accent text-white px-3 py-1.5 text-sm font-medium hover:bg-accent-hover transition-colors duration-fast"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              New unit
            </button>
          </>
        }
      />

      <div className="px-8 py-6">
        <AndonBanner events={activeAndon} onResolve={resolveAndon} />

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {WORK_STATIONS.map((station) => {
              const items = grouped.get(station.key) ?? [];
              const overLimit = items.length > station.wipLimit;
              return (
                <ShopColumn
                  key={station.key}
                  station={station.key}
                  label={station.label}
                  wip={station.wipLimit}
                  count={items.length}
                  overLimit={overLimit}
                  onRemove={removeUnit}
                  units={items}
                />
              );
            })}
          </div>
        </DndContext>
      </div>

      {showAdd && (
        <NewUnitModal onClose={() => setShowAdd(false)} onSubmit={addUnit} />
      )}
      {showAndon && (
        <AndonModal
          onClose={() => setShowAndon(false)}
          onRaise={(station, message) => {
            raiseAndon(station, message);
            setShowAndon(false);
          }}
        />
      )}
    </>
  );
}
