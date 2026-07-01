"use client";

import { useMemo, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { AlertOctagon, Plus, ChevronDown } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { PillButton } from "@shared/components/ui/PillButton";
import { cn } from "@shared/lib/utils";
import { useIsMobile } from "@shared/lib/useIsMobile";
import { useJobs } from "@features/jobs/lib/jobsStore";
import {
  useShop,
  WORK_STATIONS,
  type WorkStation,
  type WorkUnit,
  type NewWorkUnit,
} from "@features/shop/lib/shopStore";
import { ShopColumn, type JobLookup } from "./ShopColumn";
import { WorkUnitCard } from "./WorkUnitCard";
import { UnitModal } from "./UnitModal";
import { AndonBanner } from "./AndonBanner";
import { AndonModal } from "./AndonModal";

export function ShopBoard() {
  const {
    units,
    andon,
    loading,
    error,
    addUnit,
    updateUnit,
    moveUnit,
    completeUnit,
    reopenUnit,
    removeUnit,
    raiseAndon,
    resolveAndon,
  } = useShop();
  const { jobs } = useJobs();
  const isMobile = useIsMobile();

  const [showAdd, setShowAdd] = useState(false);
  const [editUnit, setEditUnit] = useState<WorkUnit | null>(null);
  const [showAndon, setShowAndon] = useState(false);
  const [mobileStation, setMobileStation] = useState<WorkStation>("cut");
  const [showCompleted, setShowCompleted] = useState(false);

  const jobLookup: JobLookup = useMemo(() => {
    const map = new Map(jobs.map((j) => [j.id, { code: j.code, title: j.name }]));
    return (jobId) => (jobId ? (map.get(jobId) ?? {}) : {});
  }, [jobs]);

  const active = useMemo(() => units.filter((u) => u.completedAt === null), [units]);
  const completed = useMemo(
    () =>
      units
        .filter((u) => u.completedAt !== null)
        .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [units]
  );

  const byStation = useMemo(() => {
    const map = new Map<WorkStation, WorkUnit[]>();
    WORK_STATIONS.forEach((s) => map.set(s.key, []));
    for (const u of active) map.get(u.station)?.push(u);
    return map;
  }, [active]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(e: DragEndEvent) {
    const { active: a, over } = e;
    if (!over) return;
    const target = WORK_STATIONS.find((s) => s.key === over.id);
    if (target) void moveUnit(String(a.id), target.key);
  }

  const activeAndon = andon.filter((a) => !a.resolvedAt);
  const totalActive = active.length;

  return (
    <>
      <PageHeader
        eyebrow="Lean Tracker"
        title="Shop floor"
        subtitle="Pieces of every job, flowing through the four stations."
        actions={
          <>
            <button
              type="button"
              onClick={() => setShowAndon(true)}
              className={cn(
                "inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors duration-fast",
                activeAndon.length > 0
                  ? "bg-status-andon-soft text-status-andon"
                  : "bg-surface text-text-secondary shadow-floating hover:text-status-andon"
              )}
            >
              <AlertOctagon className="h-4 w-4" strokeWidth={2} />
              Andon{activeAndon.length > 0 ? ` (${activeAndon.length})` : ""}
            </button>
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-ink-pill px-4 py-1.5 text-sm font-medium text-white transition-colors duration-fast hover:bg-accent-active"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              New unit
            </button>
          </>
        }
      />

      <div className="px-4 py-6 md:px-8">
        {error && (
          <p className="mb-4 rounded-lg bg-status-blocked-soft px-3 py-2 text-sm text-status-blocked">
            {error}
          </p>
        )}

        <AndonBanner events={activeAndon} onResolve={resolveAndon} />

        {loading ? (
          <BoardSkeleton />
        ) : totalActive === 0 && completed.length === 0 ? (
          <EmptyState onAdd={() => setShowAdd(true)} />
        ) : isMobile ? (
          <MobileSwitcher
            station={mobileStation}
            onStation={setMobileStation}
            units={byStation.get(mobileStation) ?? []}
            counts={byStation}
            jobLookup={jobLookup}
            onEdit={setEditUnit}
            onMove={moveUnit}
            onComplete={completeUnit}
            onReopen={reopenUnit}
            onRemove={removeUnit}
          />
        ) : (
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              {WORK_STATIONS.map((s) => (
                <ShopColumn
                  key={s.key}
                  station={s.key}
                  label={s.label}
                  wip={s.wipLimit}
                  units={byStation.get(s.key) ?? []}
                  jobLookup={jobLookup}
                  onEdit={setEditUnit}
                  onMove={moveUnit}
                  onComplete={completeUnit}
                  onReopen={reopenUnit}
                  onRemove={removeUnit}
                />
              ))}
            </div>
          </DndContext>
        )}

        {completed.length > 0 && (
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setShowCompleted((v) => !v)}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary"
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 transition-transform duration-fast",
                  showCompleted && "rotate-180"
                )}
                strokeWidth={2}
              />
              Completed ({completed.length})
            </button>
            {showCompleted && (
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {completed.map((u) => {
                  const job = jobLookup(u.jobId);
                  return (
                    <WorkUnitCard
                      key={u.id}
                      unit={u}
                      jobCode={job.code}
                      jobTitle={job.title}
                      draggable={false}
                      onEdit={() => setEditUnit(u)}
                      onMove={(s) => moveUnit(u.id, s)}
                      onComplete={() => completeUnit(u.id)}
                      onReopen={() => reopenUnit(u.id)}
                      onRemove={() => removeUnit(u.id)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {showAdd && (
        <UnitModal
          onSubmit={(values: NewWorkUnit) => void addUnit(values)}
          onClose={() => setShowAdd(false)}
        />
      )}
      {editUnit && (
        <UnitModal
          unit={editUnit}
          onSubmit={(values) => void updateUnit(editUnit.id, values)}
          onDelete={() => void removeUnit(editUnit.id)}
          onClose={() => setEditUnit(null)}
        />
      )}
      {showAndon && (
        <AndonModal
          onClose={() => setShowAndon(false)}
          onRaise={(station, message) => {
            void raiseAndon(station, message);
            setShowAndon(false);
          }}
        />
      )}
    </>
  );
}

function MobileSwitcher({
  station,
  onStation,
  units,
  counts,
  jobLookup,
  onEdit,
  onMove,
  onComplete,
  onReopen,
  onRemove,
}: {
  station: WorkStation;
  onStation: (s: WorkStation) => void;
  units: WorkUnit[];
  counts: Map<WorkStation, WorkUnit[]>;
  jobLookup: JobLookup;
  onEdit: (u: WorkUnit) => void;
  onMove: (id: string, station: WorkStation) => void;
  onComplete: (id: string) => void;
  onReopen: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const wip = WORK_STATIONS.find((s) => s.key === station)?.wipLimit ?? 0;
  const over = units.length > wip;

  return (
    <div>
      <div
        role="tablist"
        aria-label="Stations"
        className="flex gap-1 rounded-full bg-surface-muted/70 p-1 shadow-floating backdrop-blur"
      >
        {WORK_STATIONS.map((s) => {
          const n = counts.get(s.key)?.length ?? 0;
          const selected = s.key === station;
          return (
            <button
              key={s.key}
              role="tab"
              aria-selected={selected}
              onClick={() => onStation(s.key)}
              className={cn(
                "flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full px-2 text-xs font-medium transition-colors duration-fast",
                selected ? "bg-ink-pill text-white" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {s.label}
              <span
                className={cn(
                  "font-mono tabular-nums",
                  selected ? "text-white/70" : "text-text-tertiary"
                )}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between px-1">
        <h2 className="font-serif text-lg font-medium text-text-primary">
          {WORK_STATIONS.find((s) => s.key === station)?.label}
        </h2>
        <span
          className={cn(
            "font-mono text-xs tabular-nums",
            over ? "font-semibold text-status-blocked" : "text-text-tertiary"
          )}
        >
          {units.length}/{wip} {over && "· over WIP"}
        </span>
      </div>

      <div className="mt-2 flex flex-col gap-2">
        {units.length === 0 ? (
          <p className="px-2 py-10 text-center text-sm text-text-tertiary">
            Nothing at this station.
          </p>
        ) : (
          units.map((u) => {
            const job = jobLookup(u.jobId);
            return (
              <WorkUnitCard
                key={u.id}
                unit={u}
                jobCode={job.code}
                jobTitle={job.title}
                draggable={false}
                onEdit={() => onEdit(u)}
                onMove={(s) => onMove(u.id, s)}
                onComplete={() => onComplete(u.id)}
                onReopen={() => onReopen(u.id)}
                onRemove={() => onRemove(u.id)}
              />
            );
          })
        )}
      </div>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-hidden>
      {WORK_STATIONS.map((s) => (
        <div key={s.key} className="rounded-2xl bg-surface-muted/40 p-2">
          <div className="px-2 py-1.5">
            <div className="h-5 w-20 rounded bg-surface-sunken" />
          </div>
          <div className="space-y-2 p-1">
            <div className="h-24 rounded-xl bg-surface shadow-resting" />
            <div className="h-24 rounded-xl bg-surface shadow-resting" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="rounded-2xl bg-surface px-6 py-16 text-center shadow-resting">
      <h2 className="font-serif text-xl font-medium text-text-primary">The floor is clear</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-text-secondary">
        Add a work unit, a piece of a job moving through the shop, and it shows up at its station
        here. Drag it forward as it progresses.
      </p>
      <PillButton size="md" className="mt-5 min-h-[40px]" onClick={onAdd}>
        <Plus className="h-4 w-4" strokeWidth={2} />
        New unit
      </PillButton>
    </div>
  );
}
