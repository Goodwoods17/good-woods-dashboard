import type { Job } from "@shared/lib/types";
import { COMPANY } from "./invoice";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toICSDate(iso: string): string {
  // YYYYMMDD for VALUE=DATE all-day events.
  return iso.replace(/-/g, "");
}

function nowStamp(): string {
  const d = new Date();
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

function fold(line: string): string {
  // RFC 5545: lines longer than 75 octets MUST be folded.
  if (line.length <= 75) return line;
  const parts: string[] = [];
  let s = line;
  while (s.length > 75) {
    parts.push(s.slice(0, 75));
    s = s.slice(75);
  }
  parts.push(s);
  return parts.join("\r\n ");
}

function escape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
}

export function buildJobICS(job: Job): string {
  const dtStart = toICSDate(job.installDate);
  const dtEndDate = new Date(job.installDate + "T12:00:00");
  dtEndDate.setDate(dtEndDate.getDate() + 1);
  const dtEnd = toICSDate(dtEndDate.toISOString().slice(0, 10));

  const uid = `${job.id}-${job.code}@goodwoods.local`;
  const summary = `Install: ${job.name}`;
  const description = [
    `Client: ${job.client}`,
    `Job: ${job.code}`,
    job.notes ? `Notes: ${job.notes}` : "",
  ]
    .filter(Boolean)
    .join("\\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//${COMPANY.name}//Good Woods Dashboard//EN`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    fold(`UID:${uid}`),
    fold(`DTSTAMP:${nowStamp()}`),
    fold(`DTSTART;VALUE=DATE:${dtStart}`),
    fold(`DTEND;VALUE=DATE:${dtEnd}`),
    fold(`SUMMARY:${escape(summary)}`),
    fold(`DESCRIPTION:${escape(description)}`),
    fold(`LOCATION:${escape(job.address)}`),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return lines.join("\r\n");
}

export function downloadJobICS(job: Job): void {
  const ics = buildJobICS(job);
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${job.code}_install.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
