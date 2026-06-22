"use client";

import { useMemo, useState } from "react";
import { useLabour, formatDuration } from "@features/labour/lib/labourStore";
import { buildTimeCards } from "../lib/timeCards";
import { useJobs } from "@features/jobs/lib/jobsStore";
import type { Job } from "@shared/lib/types";

type Lens = "employee" | "project";

export function TimeCardsView() {
  const { sessions, workerById, operationById } = useLabour();
  const { jobs } = useJobs();
  const [lens, setLens] = useState<Lens>("employee");

  const { byWorkerDay, byJobDay } = useMemo(() => buildTimeCards(sessions), [sessions]);

  // Soft text ref: show "GW-01 · Kitchen Reno" when matched, raw id as fallback,
  // "No job" when null — sessions use a loose job_id that may not resolve.
  function jobName(id: string | null): string {
    if (id === null) return "No job";
    const j: Job | undefined = jobs.find((j) => j.id === id);
    return j ? `${j.code} · ${j.name}` : id;
  }

  const completedCount = sessions.filter((s) => s.endedAt != null).length;

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
                  {d.entries.map((e) => {
                    const opCode = operationById.get(e.operationId ?? "")?.code ?? "—";
                    return (
                      <div
                        key={e.sessionId}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted/40 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-baseline gap-2 text-sm">
                          <span className="min-w-0 truncate text-text-primary">
                            {jobName(e.jobId)}
                          </span>
                          <span className="shrink-0 font-mono text-xs text-text-tertiary">
                            {opCode}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="font-mono text-xs tabular-nums text-text-secondary">
                            {formatDuration(e.ms)}
                          </span>
                          {/* Task 4: Edit/Delete */}
                          <div className="flex items-center gap-2">{/* Task 4: Edit/Delete */}</div>
                        </div>
                      </div>
                    );
                  })}
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
                    const opCode = operationById.get(e.operationId ?? "")?.code ?? "—";
                    return (
                      <div
                        key={e.sessionId}
                        className="flex items-center justify-between gap-3 rounded-xl bg-surface-muted/40 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-baseline gap-2 text-sm">
                          <span className="min-w-0 truncate text-text-primary">{workerName}</span>
                          <span className="shrink-0 font-mono text-xs text-text-tertiary">
                            {opCode}
                          </span>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="font-mono text-xs tabular-nums text-text-secondary">
                            {formatDuration(e.ms)}
                          </span>
                          {/* Task 4: Edit/Delete */}
                          <div className="flex items-center gap-2">{/* Task 4: Edit/Delete */}</div>
                        </div>
                      </div>
                    );
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
