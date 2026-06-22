"use client";

import { useMemo, useState } from "react";
import { Play, Square, Trash2, Clock } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { useJobs } from "@features/jobs/lib/jobsStore";
import {
  useLabour,
  useNow,
  durationMs,
  formatDuration,
  type LabourSession,
} from "@features/labour/lib/labourStore";
import { DRIVER_UNIT_LABELS, type DriverUnit } from "@features/job-costing/lib/types";

export function TimersBoard() {
  const {
    operations,
    workers,
    categoryById,
    operationById,
    workerById,
    running,
    sessions,
    startTimer,
    stopTimer,
    deleteSession,
  } = useLabour();
  const { jobs } = useJobs();

  const activeOps = useMemo(() => operations.filter((o) => o.active), [operations]);
  const activeWorkers = useMemo(() => workers.filter((w) => w.active), [workers]);

  const [operationId, setOperationId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [jobId, setJobId] = useState("");

  const opLabel = (id: string) => {
    const o = operationById.get(id);
    if (!o) return "—";
    const cat = o.categoryId ? categoryById.get(o.categoryId)?.label : null;
    return cat ? `${cat} · ${o.name}` : o.name;
  };
  const jobLabel = (id: string | null) => {
    if (!id) return null;
    const j = jobs.find((x) => x.id === id);
    return j ? `${j.code || ""} ${j.name}`.trim() : null;
  };

  const recent = useMemo(
    () =>
      sessions
        .filter((s) => s.endedAt !== null)
        .sort((a, b) => (b.endedAt ?? "").localeCompare(a.endedAt ?? ""))
        .slice(0, 8),
    [sessions]
  );

  const canStart = operationId && (workerId || activeWorkers.length === 0);

  return (
    <div className="space-y-4">
      {/* Start a timer */}
      <section className="rounded-2xl bg-surface p-4 shadow-resting">
        <h3 className="mb-3 font-serif text-title font-medium text-text-primary">Start a timer</h3>
        <div className="flex flex-wrap items-end gap-3">
          <Labeled label="Operation" className="min-w-[14rem] flex-1">
            <Select value={operationId} onChange={setOperationId} placeholder="Choose operation…">
              {activeOps.map((o) => (
                <option key={o.id} value={o.id}>
                  {opLabel(o.id)}
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="Worker" className="min-w-[9rem]">
            <Select value={workerId} onChange={setWorkerId} placeholder="Who…">
              {activeWorkers.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </Select>
          </Labeled>
          <Labeled label="Job (optional)" className="min-w-[11rem]">
            <Select value={jobId} onChange={setJobId} placeholder="No job">
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {`${j.code || ""} ${j.name}`.trim()}
                </option>
              ))}
            </Select>
          </Labeled>
          <button
            type="button"
            disabled={!canStart}
            onClick={() => {
              startTimer({ operationId, workerId: workerId || null, jobId: jobId || null });
              setJobId("");
            }}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-fast",
              canStart
                ? "bg-accent text-white hover:bg-accent-hover"
                : "cursor-not-allowed bg-surface-muted text-text-tertiary"
            )}
          >
            <Play className="h-4 w-4" strokeWidth={2} fill="currentColor" />
            Start
          </button>
        </div>
        {activeWorkers.length === 0 && (
          <p className="mt-2 text-xs text-text-tertiary">
            No workers yet — add one in <span className="font-medium">Setup</span> to attribute
            time.
          </p>
        )}
      </section>

      {/* Running now */}
      <section className="rounded-2xl bg-surface p-4 shadow-resting">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-serif text-title font-medium text-text-primary">Running now</h3>
          <span className="font-mono text-xs tabular-nums text-text-tertiary">
            {running.length}
          </span>
        </div>
        {running.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-tertiary">
            Nothing running. Start a timer above when work begins.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {running.map((s) => (
              <RunningCard
                key={s.id}
                session={s}
                title={opLabel(s.operationId ?? "")}
                worker={s.workerId ? (workerById.get(s.workerId)?.name ?? null) : null}
                category={s.categoryId ? (categoryById.get(s.categoryId)?.label ?? null) : null}
                job={jobLabel(s.jobId)}
                driverUnit={
                  s.operationId ? (operationById.get(s.operationId)?.driverUnit ?? null) : null
                }
                onStop={(quantity) => stopTimer(s.id, quantity)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Recent */}
      {recent.length > 0 && (
        <section className="overflow-hidden rounded-2xl bg-surface shadow-resting">
          <h3 className="px-4 pb-1 pt-3.5 font-serif text-title font-medium text-text-primary">
            Recent
          </h3>
          <ul className="divide-y divide-border-faint">
            {recent.map((s) => (
              <li key={s.id} className="group flex items-center gap-3 px-4 py-2 text-sm">
                <Clock className="h-3.5 w-3.5 shrink-0 text-text-tertiary" strokeWidth={1.75} />
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {opLabel(s.operationId ?? "")}
                </span>
                <span className="shrink-0 text-text-tertiary">
                  {s.workerId ? workerById.get(s.workerId)?.name : ""}
                </span>
                <span className="shrink-0 font-mono tabular-nums text-text-secondary">
                  {formatDuration(durationMs(s), true)}
                </span>
                <button
                  type="button"
                  onClick={() => deleteSession(s.id)}
                  aria-label="Delete session"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-tertiary opacity-0 transition-all duration-fast hover:bg-status-blocked-soft hover:text-status-blocked group-hover:opacity-100"
                >
                  <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RunningCard({
  session,
  title,
  worker,
  category,
  job,
  driverUnit,
  onStop,
}: {
  session: LabourSession;
  title: string;
  worker: string | null;
  category: string | null;
  job: string | null;
  driverUnit: DriverUnit | null;
  onStop: (quantity?: number | null) => void;
}) {
  const now = useNow();
  // Driven codes ask "how many?" before stopping, so per-unit averages build up.
  const [confirming, setConfirming] = useState(false);
  const [qty, setQty] = useState("");

  const stop = () => {
    if (driverUnit && !confirming) {
      setConfirming(true);
      return;
    }
    if (driverUnit) {
      const n = qty.trim() === "" ? null : Number(qty);
      onStop(typeof n === "number" && Number.isFinite(n) ? n : null);
    } else {
      onStop();
    }
  };

  return (
    <div className="rounded-xl border border-accent-soft bg-accent-soft/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-medium text-text-primary">{title}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-text-tertiary">
            {category && <span className="rounded-full bg-surface px-1.5 py-0.5">{category}</span>}
            {worker && <span>{worker}</span>}
            {job && <span className="truncate">· {job}</span>}
          </div>
        </div>
        {!confirming && (
          <button
            type="button"
            onClick={stop}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink-pill px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-fast hover:opacity-90"
          >
            <Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />
            Stop
          </button>
        )}
      </div>
      <div className="mt-2 font-mono text-2xl font-medium tabular-nums text-text-primary">
        {formatDuration(durationMs(session, now), true)}
      </div>
      {confirming && driverUnit && (
        <div className="mt-2 flex items-center gap-2 border-t border-accent-soft pt-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            autoFocus
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && stop()}
            placeholder="0"
            className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-sm tabular-nums text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft"
          />
          <span className="text-xs text-text-tertiary">{DRIVER_UNIT_LABELS[driverUnit]} done</span>
          <button
            type="button"
            onClick={stop}
            className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink-pill px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
          >
            <Square className="h-3 w-3" strokeWidth={2} fill="currentColor" />
            Stop
          </button>
        </div>
      )}
    </div>
  );
}

function Labeled({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-micro uppercase tracking-wider text-text-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}
