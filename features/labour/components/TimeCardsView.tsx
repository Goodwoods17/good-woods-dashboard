"use client";

import { useMemo, useState } from "react";
import { Pencil, Trash2, Check, X } from "lucide-react";
import { useLabour, formatDuration, durationMs } from "@features/labour/lib/labourStore";
import { buildTimeCards } from "../lib/timeCards";
import type { TimeCardEntry } from "../lib/timeCards";
import { useJobs } from "@features/jobs/lib/jobsStore";
import type { Job } from "@shared/lib/types";

type Lens = "employee" | "project";

export function TimeCardsView() {
  const { sessions, workerById, operationById, updateSession, deleteSession } = useLabour();
  const { jobs } = useJobs();
  const [lens, setLens] = useState<Lens>("employee");
  const [editingId, setEditingId] = useState<string | null>(null);

  const { byWorkerDay, byJobDay } = useMemo(() => buildTimeCards(sessions), [sessions]);

  // Soft text ref: show "GW-01 · Kitchen Reno" when matched, raw id as fallback,
  // "No job" when null — sessions use a loose job_id that may not resolve.
  function jobName(id: string | null): string {
    if (id === null) return "No job";
    const j: Job | undefined = jobs.find((j) => j.id === id);
    return j ? `${j.code} · ${j.name}` : id;
  }

  const completedCount = sessions.filter((s) => s.endedAt != null).length;

  // One entry row, shared by both lenses. `primary` is the lens-specific label
  // (job name vs worker name). Carries its own inline edit form so the Save
  // logic isn't duplicated across the two lenses.
  function EntryRow({ entry, primary }: { entry: TimeCardEntry; primary: string }) {
    const opCode = operationById.get(entry.operationId ?? "")?.code ?? "—";
    const isEditing = editingId === entry.sessionId;

    return (
      <div className="rounded-xl bg-surface-muted/40 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-baseline gap-2 text-sm">
            <span className="min-w-0 truncate text-text-primary">{primary}</span>
            <span className="shrink-0 font-mono text-xs text-text-tertiary">{opCode}</span>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="font-mono text-xs tabular-nums text-text-secondary">
              {formatDuration(entry.ms)}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Edit entry"
                onClick={() => setEditingId(isEditing ? null : entry.sessionId)}
                className="rounded-md p-1 text-text-tertiary transition-colors duration-fast hover:bg-surface hover:text-text-primary"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Delete entry"
                onClick={() => {
                  if (window.confirm("Delete this time entry?")) deleteSession(entry.sessionId);
                }}
                className="rounded-md p-1 text-text-tertiary transition-colors duration-fast hover:bg-surface hover:text-status-at-risk"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
        {isEditing && <EditForm entry={entry} />}
      </div>
    );
  }

  // Inline correction form for a single entry. Pre-fills hours from durationMs
  // (NOT accumulatedMs — a no-pause completed session banks 0 there and would
  // wrongly show 0.00h) and the date from the UTC date slice. On Save it always
  // writes accumulatedMs so the session can never silently recompute its
  // duration from the edited startedAt.
  function EditForm({ entry }: { entry: TimeCardEntry }) {
    const session = sessions.find((s) => s.id === entry.sessionId);
    const [date, setDate] = useState(() => (session ? session.startedAt.slice(0, 10) : ""));
    const [hours, setHours] = useState(() =>
      session ? (durationMs(session) / 3_600_000).toFixed(2) : "0.00"
    );
    const [quantity, setQuantity] = useState(() =>
      session && session.quantity != null ? String(session.quantity) : ""
    );

    if (!session) return null;

    function save() {
      // session is non-null here (early return above).
      const s = session!;
      // Preserve the original time-of-day + Z by replacing only the date chars,
      // so an <input type="date"> never drags in a local-timezone offset.
      const newStartedAt = date + s.startedAt.slice(10);
      const hoursNum = Number(hours);
      updateSession(entry.sessionId, {
        startedAt: newStartedAt,
        accumulatedMs: Math.round(hoursNum * 3_600_000),
        quantity: quantity === "" ? null : Number(quantity),
      });
      setEditingId(null);
    }

    return (
      <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-border pt-2">
        <label className="flex flex-col gap-0.5 text-xs text-text-tertiary">
          Date
          <input
            type="date"
            value={date}
            onChange={(ev) => setDate(ev.target.value)}
            className="rounded-md bg-surface border border-border px-2 py-1 text-sm text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-text-tertiary">
          Hours
          <input
            type="number"
            step="0.25"
            min="0"
            value={hours}
            onChange={(ev) => setHours(ev.target.value)}
            className="w-24 rounded-md bg-surface border border-border px-2 py-1 text-sm text-text-primary"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-text-tertiary">
          Qty
          <input
            type="number"
            value={quantity}
            onChange={(ev) => setQuantity(ev.target.value)}
            className="w-20 rounded-md bg-surface border border-border px-2 py-1 text-sm text-text-primary"
          />
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            className="flex items-center gap-1 rounded-full bg-ink-pill px-3 py-1 text-sm font-medium text-white transition-colors duration-fast"
          >
            <Check className="h-3.5 w-3.5" />
            Save
          </button>
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (completedCount === 0) {
    return (
      <section className="rounded-2xl bg-surface p-8 text-center shadow-resting">
        <p className="text-sm text-text-tertiary">No completed sessions yet.</p>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Lens toggle + Task 5 export seam */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full bg-surface-muted p-1">
          {(["employee", "project"] as const).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={lens === l}
              onClick={() => setLens(l)}
              className={
                lens === l
                  ? "rounded-full bg-ink-pill px-4 py-1.5 text-sm font-medium text-white transition-colors duration-fast"
                  : "rounded-full px-4 py-1.5 text-sm font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary"
              }
            >
              {l === "employee" ? "By employee" : "By project"}
            </button>
          ))}
        </div>

        {/* Task 5: Export CSV button */}
        <div>{/* Task 5: Export CSV */}</div>
      </div>

      {lens === "employee" && (
        <div className="space-y-3">
          {byWorkerDay.map((d) => {
            const workerName = workerById.get(d.workerId ?? "")?.name ?? "Unassigned";
            const cardKey = `${d.workerId ?? "—"}__${d.date}`;
            return (
              <section key={cardKey} className="rounded-2xl bg-surface p-4 shadow-resting">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-title font-medium text-text-primary">
                      {workerName}
                    </span>
                    <span className="text-xs text-text-tertiary">{d.date}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-text-primary">
                    {formatDuration(d.totalMs)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {d.entries.map((e) => (
                    <EntryRow key={e.sessionId} entry={e} primary={jobName(e.jobId)} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {lens === "project" && (
        <div className="space-y-3">
          {byJobDay.map((d) => {
            const cardKey = `${d.jobId ?? "—"}__${d.date}`;
            return (
              <section key={cardKey} className="rounded-2xl bg-surface p-4 shadow-resting">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <div className="flex items-baseline gap-2">
                    <span className="font-serif text-title font-medium text-text-primary">
                      {jobName(d.jobId)}
                    </span>
                    <span className="text-xs text-text-tertiary">{d.date}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-text-primary">
                    {formatDuration(d.totalMs)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {d.entries.map((e) => {
                    const workerName = workerById.get(e.workerId ?? "")?.name ?? "Unassigned";
                    return <EntryRow key={e.sessionId} entry={e} primary={workerName} />;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
