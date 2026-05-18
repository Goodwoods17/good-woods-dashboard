"use client";

import { cn } from "@shared/lib/utils";
import type { Job } from "@shared/lib/types";
import { InstallCard } from "./InstallCard";

export function InstallGroup({
  title,
  jobs,
  onComplete,
  accent,
  muted,
  danger,
}: {
  title: string;
  jobs: Job[];
  onComplete: (j: Job) => void;
  accent?: boolean;
  muted?: boolean;
  danger?: boolean;
}) {
  return (
    <section>
      <h2
        className={cn(
          "text-xs uppercase tracking-[0.06em] mb-2 px-1",
          accent && "text-accent",
          danger && "text-status-blocked",
          !accent && !danger && (muted ? "text-text-tertiary" : "text-text-secondary")
        )}
      >
        {title}{" "}
        <span className="text-text-tertiary tabular-nums">({jobs.length})</span>
      </h2>
      {jobs.length === 0 ? (
        <div className="bg-surface border border-border border-dashed rounded-lg p-5 text-sm text-text-tertiary text-center">
          Nothing here.
        </div>
      ) : (
        <ul className="space-y-2">
          {jobs.map((job) => (
            <InstallCard key={job.id} job={job} onComplete={onComplete} />
          ))}
        </ul>
      )}
    </section>
  );
}
