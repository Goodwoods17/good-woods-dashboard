"use client";

import { useState } from "react";
import Link from "next/link";
import {
  MapPin,
  Phone,
  Calendar as CalendarIcon,
  Check,
  Truck,
  Dog,
  Cat,
  PawPrint,
  ParkingMeter,
  KeySquare,
  Hammer,
  ArrowUpDown,
} from "lucide-react";
import { formatDate } from "@shared/lib/format";
import { cn } from "@shared/lib/utils";
import type { Job, PetType, SiteAccess } from "@shared/lib/types";

const PET_ICON: Record<PetType, typeof Dog> = {
  dog: Dog,
  cat: Cat,
  other: PawPrint,
};

export function InstallCard({
  job,
  onComplete,
  tone = "default",
}: {
  job: Job;
  onComplete: (j: Job) => void;
  tone?: "today" | "default" | "muted" | "past";
}) {
  // The card disappears once the parent re-buckets the completed job, but a
  // brief local "done" state gives the installer instant confirmation that
  // the tap registered (no waiting for a list re-render to feel it).
  const [confirming, setConfirming] = useState(false);

  const sa: SiteAccess = job.siteAccess ?? {};
  const installAddress = sa.installAddress?.trim() || job.address;
  const mapsHref = installAddress
    ? `https://maps.google.com/?q=${encodeURIComponent(installAddress)}`
    : `https://maps.google.com/?q=${encodeURIComponent(job.client)}`;

  const codes = [
    sa.doorCode && { label: "Door", value: sa.doorCode },
    sa.buzzerCode && { label: "Buzzer", value: sa.buzzerCode },
    sa.lockboxCode && { label: "Lockbox", value: sa.lockboxCode },
  ].filter(Boolean) as { label: string; value: string }[];

  const hasStrip =
    sa.pet?.type ||
    sa.parkingNotes ||
    codes.length > 0 ||
    sa.siteContact?.phone ||
    sa.demoRequired ||
    sa.elevatorRequired;

  // Leading status dot, readable at arm's length in the truck:
  //   past   → blocked (red): install date slipped, needs attention now
  //   today  → on-track (the job on deck)
  //   else   → paused (quiet): scheduled but not yet actionable
  const dotClass =
    tone === "past"
      ? "bg-status-blocked"
      : tone === "today"
        ? "bg-status-on-track"
        : "bg-status-paused";

  function handleComplete() {
    setConfirming(true);
    onComplete(job);
  }

  return (
    <li
      className={cn(
        "rounded-2xl bg-surface p-4 shadow-resting transition-shadow duration-fast",
        confirming && "opacity-60"
      )}
    >
      <div className="flex items-start gap-2.5">
        <span className={cn("mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Link
                href={`/jobs/${job.id}`}
                className="block rounded-md text-title font-serif text-text-primary leading-snug transition-colors duration-fast hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent-soft"
              >
                {job.name}
              </Link>
              <div className="mt-0.5 flex items-center gap-1.5 text-sm text-text-secondary">
                <Truck className="h-3.5 w-3.5 text-text-tertiary" strokeWidth={1.75} />
                {job.client}
              </div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-micro uppercase tracking-wider text-text-tertiary">Install</div>
              <div className="font-mono text-sm font-medium tabular-nums text-text-primary">
                {formatDate(job.installDate)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <a
        href={mapsHref}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 flex min-h-[44px] items-center gap-2 rounded-xl bg-accent-soft/40 px-3 py-2 text-sm text-accent transition-colors duration-fast hover:text-accent-active focus:outline-none focus:ring-2 focus:ring-accent-soft active:bg-accent-soft"
      >
        <MapPin className="h-4 w-4 shrink-0" strokeWidth={1.75} />
        <span className="flex-1 truncate">{installAddress || "No address on file"}</span>
        <span className="shrink-0 text-xs font-medium">Maps</span>
      </a>

      {hasStrip && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {sa.pet?.type && <PetPill type={sa.pet.type} name={sa.pet.name} note={sa.pet.note} />}
          {sa.demoRequired && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-blocked-soft px-2.5 py-1 text-xs font-medium text-status-blocked">
              <Hammer className="h-3 w-3" strokeWidth={1.75} />
              Demo required
            </span>
          )}
          {sa.elevatorRequired && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-secondary">
              <ArrowUpDown className="h-3 w-3" strokeWidth={1.75} />
              Elevator
              {sa.elevatorWindow && (
                <span className="text-text-tertiary">. {sa.elevatorWindow}</span>
              )}
            </span>
          )}
          {codes.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-secondary"
            >
              <KeySquare className="h-3 w-3 text-text-tertiary" strokeWidth={1.75} />
              <span className="text-text-tertiary">{c.label}</span>
              <span className="font-mono tabular-nums text-text-primary">{c.value}</span>
            </span>
          ))}
          {sa.parkingNotes && (
            <span
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-text-secondary"
              title={sa.parkingNotes}
            >
              <ParkingMeter className="h-3 w-3 shrink-0" strokeWidth={1.75} />
              <span className="truncate max-w-[180px]">{sa.parkingNotes}</span>
            </span>
          )}
          {sa.siteContact?.phone && (
            <a
              href={`tel:${sa.siteContact.phone}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-text-secondary transition-colors duration-fast hover:text-text-primary focus:outline-none focus:ring-2 focus:ring-accent-soft"
              title={[sa.siteContact.name, sa.siteContact.role, sa.siteContact.phone]
                .filter(Boolean)
                .join(" . ")}
            >
              <Phone className="h-3 w-3" strokeWidth={1.75} />
              Backup
              {sa.siteContact.name && (
                <span className="text-text-primary">. {sa.siteContact.name}</span>
              )}
            </a>
          )}
        </div>
      )}

      {job.notes && (
        <div className="mt-2.5 rounded-xl bg-surface-muted px-3 py-2 text-sm leading-relaxed text-text-secondary">
          {job.notes}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Link
          href={`/jobs/${job.id}`}
          className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full bg-surface px-3 py-2 text-sm font-medium text-text-secondary shadow-floating transition-shadow duration-fast hover:shadow-hover focus:outline-none focus:ring-2 focus:ring-accent-soft"
        >
          <CalendarIcon className="h-4 w-4" strokeWidth={1.75} />
          Job details
        </Link>
        <button
          type="button"
          onClick={handleComplete}
          disabled={confirming}
          aria-label={confirming ? "Marked done" : "Mark install done"}
          className={cn(
            "inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium text-white transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft",
            confirming ? "bg-status-complete" : "bg-ink-pill hover:bg-accent-active"
          )}
        >
          <Check className="h-4 w-4" strokeWidth={2.25} />
          {confirming ? "Done" : "Mark done"}
        </button>
      </div>
    </li>
  );
}

function PetPill({
  type,
  name,
  note,
}: {
  type: PetType;
  name?: string | null;
  note?: string | null;
}) {
  const Icon = PET_ICON[type];
  const label = [name, note].filter(Boolean).join(" . ") || type;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
      <Icon className="h-3 w-3" strokeWidth={1.75} />
      {label}
    </span>
  );
}
