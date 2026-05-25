"use client";

import Link from "next/link";
import { MapPin, Phone, Calendar as CalendarIcon, Check, Truck } from "lucide-react";
import { formatDate } from "@shared/lib/format";
import type { Job } from "@shared/lib/types";

export function InstallCard({
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
          <div className="text-micro uppercase tracking-wider text-text-tertiary">
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
