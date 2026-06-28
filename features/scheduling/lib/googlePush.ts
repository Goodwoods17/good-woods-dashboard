import type { Job } from "@shared/lib/types";
import { MILESTONE_STAGES } from "@shared/lib/types";
import { internalPhaseLabel } from "./phases";

/**
 * Pure model for the **one-way** Google Calendar push (S23, issue #111).
 *
 * The app is the single source of truth (ADR 0020); we never read changes back
 * from Google, which dodges the two-way "410 Gone" sync dragon entirely. This
 * module computes WHAT should be in the owner's calendar for a job and DIFFS it
 * against what we last pushed, producing an idempotent create/update/delete plan.
 * The route layer (which actually talks to Google) consumes that plan and stamps
 * the per-event google ids back into `scheduling_google_events`.
 *
 * JSX-free + Supabase-free so it unit-tests under node vitest and is reused by
 * the server route.
 */

/** Least-privilege scope: write calendar EVENTS only — no read of other data. */
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

/** One desired all-day calendar event derived from a job's schedule. */
export type GoogleCalendarEvent = {
  /** Stable per-job-per-target identity for idempotent upsert. */
  syncKey: string;
  /** Human summary (always names the job). */
  summary: string;
  /** Longer description shown in the calendar event body. */
  description: string;
  /** All-day date, ISO `YYYY-MM-DD`. */
  date: string;
};

/** A row of what we last pushed, loaded from `scheduling_google_events`. */
export type ExistingSyncRow = {
  syncKey: string;
  googleEventId: string;
  /** The date we last wrote to Google for this syncKey (ISO `YYYY-MM-DD`). */
  syncedDate: string;
};

export type CalendarSyncPlan = {
  toCreate: GoogleCalendarEvent[];
  toUpdate: { event: GoogleCalendarEvent; googleEventId: string }[];
  toDelete: { syncKey: string; googleEventId: string }[];
};

/**
 * Derive the desired calendar events for one job: each internal phase TARGET
 * that has a date, plus the frozen client-committed install. Phases without a
 * target are skipped (nothing to schedule yet).
 */
export function buildJobCalendarEvents(job: Job): GoogleCalendarEvent[] {
  const events: GoogleCalendarEvent[] = [];
  const name = job.name?.trim() || "Untitled job";
  const targets = job.phaseTargetDates ?? {};

  for (const { key } of MILESTONE_STAGES) {
    const date = targets[key];
    if (!date) continue;
    events.push({
      syncKey: `${job.id}:phase:${key}`,
      summary: `${name} — ${internalPhaseLabel(key)} target`,
      description: `Internal ${internalPhaseLabel(key)} target for ${name}. Managed by Good Woods — do not edit here; changes are overwritten on the next push.`,
      date,
    });
  }

  if (job.installDate) {
    events.push({
      syncKey: `${job.id}:committed-install`,
      summary: `${name} — Install (committed)`,
      description: `Client-committed install date for ${name}. Managed by Good Woods.`,
      date: job.installDate,
    });
  }

  return events;
}

/**
 * Idempotent diff: compare the desired events against what we last pushed.
 *
 * - **create** — desired syncKey with no stored google event id.
 * - **update** — desired syncKey whose date moved since the last push (carries
 *   the existing google event id so the route can PATCH in place).
 * - **delete** — a stored mapping whose syncKey is no longer desired (a phase
 *   target was cleared, or the install date removed).
 *
 * Running it twice with no schedule change yields three empty lists — the
 * property that makes re-pushing safe.
 *
 * NOTE on "deleted-in-Google": if a PATCH later 404s because the owner deleted
 * the event in Google, the route treats that update as a create (re-materialise
 * the event). That recovery lives in the route since it needs the live API
 * response; the pure plan only encodes intent.
 */
export function diffCalendarSync(
  desired: GoogleCalendarEvent[],
  existing: ExistingSyncRow[]
): CalendarSyncPlan {
  const existingByKey = new Map(existing.map((r) => [r.syncKey, r]));
  const desiredKeys = new Set(desired.map((e) => e.syncKey));

  const toCreate: GoogleCalendarEvent[] = [];
  const toUpdate: { event: GoogleCalendarEvent; googleEventId: string }[] = [];

  for (const event of desired) {
    const prior = existingByKey.get(event.syncKey);
    if (!prior) {
      toCreate.push(event);
    } else if (prior.syncedDate !== event.date) {
      toUpdate.push({ event, googleEventId: prior.googleEventId });
    }
  }

  const toDelete = existing
    .filter((r) => !desiredKeys.has(r.syncKey))
    .map((r) => ({ syncKey: r.syncKey, googleEventId: r.googleEventId }));

  return { toCreate, toUpdate, toDelete };
}
