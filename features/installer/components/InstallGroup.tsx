"use client";

import { cn } from "@shared/lib/utils";
import type { Job } from "@shared/lib/types";
import { InstallCard } from "./InstallCard";

type GroupTone = "today" | "default" | "muted" | "past";

export function InstallGroup({
  title,
  jobs,
  onComplete,
  tone = "default",
}: {
  title: string;
  jobs: Job[];
  onComplete: (j: Job) => void;
  tone?: GroupTone;
}) {
  return (
    <section>
      <h2
        className={cn(
          "mb-2 px-1 text-xs uppercase tracking-[0.06em]",
          tone === "today" && "text-status-on-track",
          tone === "past" && "text-status-blocked",
          tone === "muted" && "text-text-tertiary",
          tone === "default" && "text-text-secondary"
        )}
      >
        {title} <span className="tabular-nums text-text-tertiary">({jobs.length})</span>
      </h2>
      {jobs.length === 0 ? (
        <div className="rounded-2xl bg-surface-muted px-5 py-5 text-center text-sm text-text-tertiary">
          Nothing here.
        </div>
      ) : (
        <ul className="space-y-3">
          {jobs.map((job) => (
            <InstallCard key={job.id} job={job} onComplete={onComplete} tone={tone} />
          ))}
        </ul>
      )}
    </section>
  );
}
