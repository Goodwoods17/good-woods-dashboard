"use client";

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
import type { Job, PetType, SiteAccess } from "@shared/lib/types";

const PET_ICON: Record<PetType, typeof Dog> = {
  dog: Dog,
  cat: Cat,
  other: PawPrint,
};

export function InstallCard({
  job,
  onComplete,
}: {
  job: Job;
  onComplete: (j: Job) => void;
}) {
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
        <span className="flex-1 truncate">{installAddress || "No address on file"}</span>
        <span className="text-xs">Maps</span>
      </a>

      {hasStrip && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {sa.pet?.type && (
            <PetPill type={sa.pet.type} name={sa.pet.name} note={sa.pet.note} />
          )}
          {sa.demoRequired && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-status-blocked-soft text-status-blocked px-2 py-0.5 text-xs font-medium">
              <Hammer className="h-3 w-3" strokeWidth={1.75} />
              Demo required
            </span>
          )}
          {sa.elevatorRequired && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted text-text-secondary px-2 py-0.5 text-xs font-medium">
              <ArrowUpDown className="h-3 w-3" strokeWidth={1.75} />
              Elevator
              {sa.elevatorWindow && <span className="text-text-tertiary">. {sa.elevatorWindow}</span>}
            </span>
          )}
          {codes.map((c) => (
            <span
              key={c.label}
              className="inline-flex items-center gap-1 rounded-full bg-surface-muted text-text-secondary px-2 py-0.5 text-xs font-medium"
            >
              <KeySquare className="h-3 w-3 text-text-tertiary" strokeWidth={1.75} />
              <span className="text-text-tertiary">{c.label}</span>
              <span className="font-mono tabular-nums text-text-primary">{c.value}</span>
            </span>
          ))}
          {sa.parkingNotes && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted text-text-secondary px-2 py-0.5 text-xs font-medium max-w-full"
              title={sa.parkingNotes}
            >
              <ParkingMeter className="h-3 w-3" strokeWidth={1.75} />
              <span className="truncate max-w-[180px]">{sa.parkingNotes}</span>
            </span>
          )}
          {sa.siteContact?.phone && (
            <a
              href={`tel:${sa.siteContact.phone}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted text-text-secondary hover:text-text-primary px-2 py-0.5 text-xs font-medium transition-colors duration-fast"
              title={[
                sa.siteContact.name,
                sa.siteContact.role,
                sa.siteContact.phone,
              ]
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
        <div className="bg-surface-muted border border-border rounded px-3 py-2 text-sm text-text-secondary leading-relaxed">
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
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft text-accent px-2 py-0.5 text-xs font-medium">
      <Icon className="h-3 w-3" strokeWidth={1.75} />
      {label}
    </span>
  );
}
