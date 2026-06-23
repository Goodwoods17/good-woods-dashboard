# External Blockers (Slice B2) — Design

**Status:** Approved design (2026-06-22). Next: grill → plan → build.
**Supersedes:** the "Adjacent — external blockers (Slice B2)" sketch in
`docs/superpowers/specs/2026-06-22-shopfloor-capture-slice-b-design.md`.
**Glossary:** `docs/domain.md` → **External blocker** (already defined).

## Problem

A **`stuck` work card is internal** — the crew can unstick it. A project waiting on an
**outside party** (client sign-off on shop drawings, designer-approved handles, a permit,
a supplier ship date) is a different thing: it is **out of the shop's hands** and blocks at
the **project / phase** level. Today the only home for this is the free-text `job.blocker`
string, which can't be counted, aged, attributed to a party, or tied to the phase it gates.

This slice makes external blockers **structured**: *what* we're waiting for, *who* we're
waiting on, *since when* (so it ages), and *which phase it gates* — and wires that into the
job's health, the Hitlist, the Schedule, the morning briefing, the milestone-advance flow,
and the shop board.

## Locked decisions

1. **Derive on read.** The `job_blockers` table is the source of truth. An active blocker
   makes a job's **effective health `blocked`** and supplies the real blocker-chip text;
   resolving it clears that state with no manual cleanup. (Not write-through to `job.blocker`
   / `job.health_status`.)
2. **Soft milestone gate.** Advancing a phase that has an active gating blocker **warns but
   allows** ("This phase is externally blocked — advance anyway?"). The blocker stays recorded.
3. **Full slice.** Table + store + derivation + JobDetail add/resolve UI + soft milestone
   gate + shop-board read-only chip + briefing integration, all in this slice.

## Architecture

Four layers, each independently testable:

- **Data** — `job_blockers` table (migration) + `JobBlocker` type + row mappers.
- **Store** — `jobBlockersStore` (`useJobBlockers`), dual-mode (Supabase / localStorage),
  mirroring `workCardsStore`. Exposes `blockers`, `activeByJob` (memoized
  `Map<jobId, JobBlocker[]>`), `addBlocker`, `resolveBlocker`, `reopenBlocker`, `refresh`.
- **Derivation (pure)** — `features/jobs/lib/jobBlockers.ts`: pure helpers that take a job +
  its active blockers and return effective health + the chip text/tone. The existing
  `deriveHealth` / `resolveBlockerText` / `resolveBlockerTone` gain an **optional**
  `activeBlockers` argument (backward-compatible: no arg = today's behavior).
- **Consumers (thin)** — JobDetail (UI + gate), shop board chip, briefing prompt; Hitlist /
  Schedule / pipeline light up for free through the derivation.

### Data model — `job_blockers`

```
id                    uuid       pk default gen_random_uuid()
job_id                text       not null references public.jobs(id) on delete cascade
reason                text       not null            -- "client sign-off on shop drawings"
waiting_on_contact_id uuid       null references public.contacts(id) on delete set null
waiting_on_label      text       null                -- free fallback when no contact ("Richelieu rep")
gated_phase_id        text       null                -- one of the 6 MilestoneStage values; null = blocks whole job
raised_at             timestamptz not null default now()
resolved_at           timestamptz null                -- null = active
created_at            timestamptz not null default now()
updated_at            timestamptz not null default now()
```

- **RLS:** authenticated-only (select/insert/update/delete), matching `work_cards` /
  `labour_sessions`.
- **Index:** `(job_id) where resolved_at is null` for the active-lookup.
- **Active** = `resolved_at is null`. **Aging** = whole days since `raised_at`.
- **Waiting-on display:** `waiting_on_contact_id` → contact name (+ its role tag if any);
  else `waiting_on_label`; else "someone" (a reason with no party is allowed).
- `job_id` is **text** (jobs PK is text, not uuid) — match the `work_cards.job_id` precedent.

### `JobBlocker` type + row mapper

```ts
export type JobBlocker = {
  id: string;
  jobId: string;
  reason: string;
  waitingOnContactId: string | null;
  waitingOnLabel: string | null;
  gatedPhaseId: MilestoneStage | null;
  raisedAt: string;       // ISO
  resolvedAt: string | null;
};
```
Row mapper `jobBlockerRowMap.ts` (`rowToBlocker` / `blockerToRow`), camel↔snake, in
`features/jobs/lib/`.

### Derivation (source of truth on read)

Pure module `features/jobs/lib/jobBlockers.ts`:

- `activeBlockers(all: JobBlocker[], jobId: string): JobBlocker[]` — `resolvedAt == null`,
  sorted oldest-`raisedAt`-first (most-aged is the headline).
- `blockerAgeDays(b, now): number` — whole days since `raisedAt`.
- `blockerPartyLabel(b, contactName): string` — contact name (+role) | label | "someone".
- `externalBlockerChip(active, contactName, now): { text, tone } | null` — when `active`
  is non-empty: `text = "Waiting on {party} · {N}d"` (headline = oldest), `tone = "blocked"`.

**Health precedence (in `deriveHealth(job, activeBlockers?)`):**
`manual paused` > `active external blocker → "blocked"` > existing schedule-derived rule.

**Chip precedence (in `resolveBlockerText` / `resolveBlockerTone`):** an active external
blocker yields a **real** (non-synthetic) chip from the headline blocker; otherwise today's
behavior (real `job.blocker`, else synthetic demo fallback).

### UI — JobDetail "Blockers" card

A new section/card on `JobDetail` (the job's own page), placed near the status header:

- **Active list** — each row: `reason` · waiting-on party · `Nd` aging badge (amber→red as
  it ages) · **Resolve** button (sets `resolved_at = now`).
- **Add blocker** — inline form: `reason` (text, required), **waiting on** (a Contact picker
  drawn from the job's linked contacts + all contacts, OR a free-text label when the party
  isn't a contact), **gates phase** (optional dropdown of the 6 phases, default "whole job").
- **History** — resolved blockers collapsed below ("Resolved · waiting was on X · 4d"), with
  a **Reopen** affordance. No hard delete in v1 (history is the audit trail).
- Tokens only; matches the JobDetail card idiom; touch targets ≥44px (shop tablet).

### Soft milestone gate

`MilestonesStrip`'s advance path (`onChange` → `updateJob({ currentMilestone })`, used in
`JobDetail` and `TasksTab`) is wrapped: if the **target phase** has an active gating blocker
(`gated_phase_id === targetPhase`), show an **inline confirm** ("⏳ {phase} is externally
blocked — waiting on {party}. Advance anyway?") → proceed or cancel. A blocker with
`gated_phase_id = null` (whole-job) gates **every** advance. No confirm when there's no
gating blocker (unchanged flow).

### Shop board read-only chip

On `/shop`, the selected job's gated phase column header shows a read-only
`⏳ externally blocked — waiting on {party} · {N}d` chip when that phase (or the whole job)
has an active blocker, read from `useJobBlockers().activeByJob`. Read-only — no add/resolve
on the shop board (that lives on the job).

### Briefing integration

`features/briefing/lib/prompt.ts`:
- `JobInput` gains `externalBlockers: { reason: string; party: string; days: number }[]`.
- `jobsToInput(jobs, blockers, contacts)` populates it from active blockers.
- `SYSTEM_PROMPT` gains a rule: a job with an external blocker is **high-priority** — surface
  "{job}: externally blocked — waiting on {party} for {N}d ({reason})" and suggest the nudge
  (chase the party). `generateBriefing` passes the blockers + contact lookup through.

## Out of scope (this slice)

- Migrating existing free-text `job.blocker` strings into structured rows (manual; the
  free-text path stays as a fallback for un-migrated jobs).
- Notifications / reminders when a blocker ages past a threshold (a later nicety).
- Per-blocker assignment/owner beyond "waiting on" (no internal owner field).
- Editing a blocker's reason after creation (resolve + re-add instead) — revisit if it bites.

## Testing

- **Pure derivation** (`jobBlockers.ts`): active filter + sort, aging math, party label
  resolution, health precedence (paused > blocked > schedule), chip text — `tsx` unit suite.
- **Row mapper**: round-trip camel↔snake incl. nulls — `tsx`.
- **Store**: dual-mode add/resolve/reopen + `activeByJob` memo (light, mirrors workCards).
- **Migration**: transactional dry-run; RLS proven authenticated-only.
- **Browser smoke** (authenticated): add a blocker on a job → Hitlist sorts it to top + chip
  shows party/aging → try to advance the gated milestone → soft warn → shop board shows the
  read-only chip → resolve → state clears.

## ADR

Propose **ADR 0013 — external blockers as structured source of truth** during the grill:
derive-health-from-blockers + soft gate is hard to reverse (data model + the health
precedence rule) and a real trade-off (structured vs the existing free-text field).
