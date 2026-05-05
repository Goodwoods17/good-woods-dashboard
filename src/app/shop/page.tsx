"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  useDroppable,
  useDraggable,
} from "@dnd-kit/core";
import { AlertOctagon, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { useShop, WORK_STATIONS, type WorkStation } from "@/lib/shopStore";
import { cn } from "@/lib/utils";

function hoursAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return `${Math.floor(ms / 60_000)}m`;
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

export default function ShopPage() {
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
    const id = String(active.id);
    moveUnit(id, target.key);
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
        {activeAndon.length > 0 && (
          <div className="mb-4 bg-status-andon-soft border border-status-andon rounded-lg p-3 flex items-start gap-3">
            <AlertOctagon
              className="h-5 w-5 text-status-andon shrink-0 mt-0.5 animate-pulse"
              strokeWidth={2}
            />
            <div className="flex-1">
              <div className="text-sm font-semibold text-status-andon mb-1">
                {activeAndon.length} active andon
                {activeAndon.length === 1 ? "" : "s"}
              </div>
              <ul className="space-y-1">
                {activeAndon.map((a) => (
                  <li
                    key={a.id}
                    className="text-xs text-status-andon flex items-center gap-2"
                  >
                    <span className="font-medium uppercase tracking-wider">
                      {a.station}
                    </span>
                    <span>·</span>
                    <span className="flex-1">{a.message}</span>
                    <button
                      onClick={() => resolveAndon(a.id)}
                      className="text-text-secondary hover:text-status-on-track text-xs underline"
                    >
                      resolve
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {WORK_STATIONS.map((station) => {
              const items = grouped.get(station.key) ?? [];
              const overLimit = items.length > station.wipLimit;
              return (
                <Column
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

      {showAdd && <NewUnitModal onClose={() => setShowAdd(false)} onSubmit={addUnit} />}
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

function Column({
  station,
  label,
  wip,
  count,
  overLimit,
  units,
  onRemove,
}: {
  station: WorkStation;
  label: string;
  wip: number;
  count: number;
  overLimit: boolean;
  units: { id: string; jobCode: string; description: string; startedAt: string }[];
  onRemove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: station });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col rounded-lg border bg-surface-muted/40 transition-colors duration-fast min-h-[300px]",
        isOver ? "border-accent bg-accent-soft/30" : "border-border"
      )}
    >
      <div className="px-3 py-2.5 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {label}
          </span>
          <span
            className={cn(
              "text-xs tabular-nums px-1.5 rounded",
              overLimit
                ? "text-status-blocked bg-status-blocked-soft font-semibold"
                : "text-text-tertiary"
            )}
          >
            {count} / {wip}
          </span>
        </div>
        {overLimit && (
          <span className="text-[10px] uppercase tracking-wider text-status-blocked font-semibold">
            Over WIP
          </span>
        )}
      </div>
      <div className="flex-1 p-2 space-y-2">
        {units.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-text-tertiary">
            Drag units here
          </div>
        ) : (
          units.map((u) => (
            <DraggableCard key={u.id} unit={u} onRemove={() => onRemove(u.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  unit,
  onRemove,
}: {
  unit: { id: string; jobCode: string; description: string; startedAt: string };
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: unit.id,
  });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "bg-surface border rounded-md p-2.5 group cursor-grab",
        isDragging
          ? "border-accent shadow-md opacity-60 cursor-grabbing"
          : "border-border hover:border-border-strong"
      )}
      {...attributes}
      {...listeners}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <span className="text-[10px] uppercase tracking-wider tabular-nums text-text-tertiary">
          {unit.jobCode}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-text-tertiary hover:text-status-blocked opacity-0 group-hover:opacity-100 transition-opacity duration-fast"
          aria-label="Remove"
        >
          <X className="h-3 w-3" strokeWidth={2} />
        </button>
      </div>
      <div className="text-sm text-text-primary leading-snug mb-1.5">
        {unit.description}
      </div>
      <div className="text-[10px] tabular-nums text-text-tertiary">
        {hoursAgo(unit.startedAt)} on station
      </div>
    </div>
  );
}

function NewUnitModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (u: { jobCode: string; description: string; station: WorkStation }) => void;
}) {
  const [jobCode, setJobCode] = useState("");
  const [description, setDescription] = useState("");
  const [station, setStation] = useState<WorkStation>("cut");

  return (
    <Modal onClose={onClose} title="New work unit">
      <FieldStack>
        <Field label="Job code">
          <Input value={jobCode} onChange={setJobCode} placeholder="GW-2026-001" />
        </Field>
        <Field label="Description">
          <Input
            value={description}
            onChange={setDescription}
            placeholder="e.g. Suite 305 — upper boxes"
          />
        </Field>
        <Field label="Starting station">
          <select
            value={station}
            onChange={(e) => setStation(e.target.value as WorkStation)}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2"
          >
            {WORK_STATIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-text-secondary hover:text-text-primary">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!jobCode.trim() || !description.trim()) return;
              onSubmit({ jobCode: jobCode.trim(), description: description.trim(), station });
              onClose();
            }}
            className="px-3 py-1.5 text-sm rounded-md bg-accent text-white hover:bg-accent-hover"
          >
            Add unit
          </button>
        </div>
      </FieldStack>
    </Modal>
  );
}

function AndonModal({
  onClose,
  onRaise,
}: {
  onClose: () => void;
  onRaise: (station: WorkStation | "all", message: string) => void;
}) {
  const [station, setStation] = useState<WorkStation | "all">("all");
  const [message, setMessage] = useState("");

  return (
    <Modal onClose={onClose} title="Raise andon" tone="andon">
      <FieldStack>
        <Field label="Station">
          <select
            value={station}
            onChange={(e) => setStation(e.target.value as WorkStation | "all")}
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2"
          >
            <option value="all">Whole shop</option>
            {WORK_STATIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="What's the issue?">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            placeholder="e.g. Out of #20 hinges — can't continue"
            className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 resize-none"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-md border border-border bg-surface text-text-secondary">
            Cancel
          </button>
          <button
            onClick={() => message.trim() && onRaise(station, message.trim())}
            className="px-3 py-1.5 text-sm rounded-md bg-status-andon text-white hover:opacity-90"
          >
            <span className="inline-flex items-center gap-1.5">
              <AlertOctagon className="h-3.5 w-3.5" strokeWidth={2} />
              Raise
            </span>
          </button>
        </div>
      </FieldStack>
    </Modal>
  );
}

function Modal({
  title,
  tone,
  children,
  onClose,
}: {
  title: string;
  tone?: "andon";
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-text-primary/30 backdrop-blur-sm flex items-center justify-center px-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-surface border border-border-strong rounded-lg shadow-lg overflow-hidden"
      >
        <div
          className={cn(
            "px-5 py-3.5 border-b border-border flex items-center justify-between",
            tone === "andon" ? "bg-status-andon-soft" : "bg-surface-muted"
          )}
        >
          <h3
            className={cn(
              "text-sm font-semibold",
              tone === "andon" ? "text-status-andon" : "text-text-primary"
            )}
          >
            {title}
          </h3>
          <button onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function FieldStack({ children }: { children: React.ReactNode }) {
  return <div className="space-y-3">{children}</div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs uppercase tracking-[0.06em] text-text-tertiary mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm bg-surface-muted border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
    />
  );
}
