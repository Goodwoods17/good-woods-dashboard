"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  MapPin,
  Phone,
  Calendar as CalendarIcon,
  Check,
  Truck,
} from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useJobs } from "@features/jobs/lib/jobsStore";
import { formatDate } from "@shared/lib/format";
import type { Job } from "@shared/lib/types";
import { cn } from "@shared/lib/utils";

function bucket(job: Job, today: Date): "today" | "this_week" | "later" | "past" {
  const install = new Date(job.installDate + "T12:00:00");
  const t = new Date(today);
  t.setHours(0, 0, 0, 0);
  const diffDays = Math.floor(
    (install.getTime() - t.getTime()) / (1000 * 60 * 60 * 24)
  );
  if (diffDays === 0) return "today";
  if (diffDays > 0 && diffDays <= 7) return "this_week";
  if (diffDays > 7) return "later";
  return "past";
}

export default function InstallerPage() {
  const { jobs, updateJob } = useJobs();

  const groups = useMemo(() => {
    const today = new Date();
    const result = {
      today: [] as Job[],
      this_week: [] as Job[],
      later: [] as Job[],
      past: [] as Job[],
    };
    for (const j of jobs) {
      if (j.pipelineStatus === "complete") continue;
      result[bucket(j, today)].push(j);
    }
    Object.values(result).forEach((arr) =>
      arr.sort((a, b) => a.installDate.localeCompare(b.installDate))
    );
    return result;
  }, [jobs]);

  function markInstalled(job: Job) {
    updateJob(job.id, {
      pipelineStatus: "complete",
      healthStatus: "complete",
      currentMilestone: "install",
    });
  }

  return (
    <>
      <PageHeader
        eyebrow="Installer Portal"
        title="Today on site"
        subtitle="Pinned to today, optimised for phone. Tap an address to navigate."
      />
      <div className="px-4 md:px-8 py-6 max-w-3xl space-y-6">
        <Group title="Today" jobs={groups.today} onComplete={markInstalled} accent />
        <Group title="This week" jobs={groups.this_week} onComplete={markInstalled} />
        <Group title="Coming up" jobs={groups.later} onComplete={markInstalled} muted />
        {groups.past.length > 0 && (
          <Group
            title="Past due — install date passed but not marked complete"
            jobs={groups.past}
            onComplete={markInstalled}
            danger
          />
        )}
      </div>
    </>
  );
}

function Group({
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

function InstallCard({
  job,
  onComplete,
}: {
  job: Job;
  onComplete: (j: Job) => void;
}) {
  const mapsHref = `https://maps.google.com/?q=${encodeURIComponent(job.address)}`;
  return (
    <li className="bg-surface border border-border rounded-lg p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <Link
            href={`/jobs/${job.id}`}
            className="block text-base font-semibold text-text-primary hover:text-accent transition-colors duration-fast leading-snug"
          >
            {job.name}
          </Link>
          <div className="text-sm text-text-secondary mt-0.5 flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
            {job.client}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-text-tertiary">
            Install
          </div>
          <div className="text-sm font-medium text-text-primary tabular-nums">
            {formatDate(job.installDate)}
          </div>
        </div>
      </div>

      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-sm text-accent hover:text-accent-hover transition-colors duration-fast bg-accent-soft/40 border border-accent-soft rounded-md px-3 py-2 active:bg-accent-soft"
      >
        <MapPin className="h-4 w-4" strokeWidth={1.75} />
        <span className="flex-1 truncate">{job.address || "No address on file"}</span>
        <span className="text-xs">→ Maps</span>
      </a>

      {job.notes && (
        <div className="bg-surface-muted border-l-2 border-accent rounded px-3 py-2 text-sm text-text-secondary leading-relaxed">
          {job.notes}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <a
          href={`tel:`}
          aria-disabled
          className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-fast"
          onClick={(e) => e.preventDefault()}
        >
          <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
          Call client
        </a>
        <Link
          href={`/jobs/${job.id}`}
          className="inline-flex items-center justify-center gap-1.5 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text-secondary hover:text-text-primary transition-colors duration-fast"
        >
          <CalendarIcon className="h-3.5 w-3.5" strokeWidth={1.75} />
          Job details
        </Link>
        <button
          onClick={() => onComplete(job)}
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-status-on-track text-white px-3 py-2 text-sm font-medium hover:opacity-90 transition-opacity duration-fast"
        >
          <Check className="h-3.5 w-3.5" strokeWidth={2} />
          Done
        </button>
      </div>
    </li>
  );
}
