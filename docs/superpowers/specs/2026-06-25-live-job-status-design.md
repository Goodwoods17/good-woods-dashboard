# Live Job Status — design spec (internal MVP)

**Date:** 2026-06-25
**Status:** Approved (brainstorm) — awaiting plan
**Feature folder (proposed):** `features/job-status/`

## Why

Field/shop crew should update where each job is, from their phones, and the owner
should see **live** progress across all jobs. This is the foundation for a future
**client portal** (homeowners / designers / GCs watch their job progress live —
scheduling opacity is the #1 pain point in custom work) and a future **installer
daily log**. We build the internal, owner-facing version first so the status data
is proven trustworthy before anything is exposed externally.

**Key realisation from architecture review:** real-time needs **no home/always-on
server** — Supabase Realtime already pushes row changes to every connected client.
The backend stays cloud (Supabase + Vercel); the home PC is a Mozaik/dev
workstation, not an app server.

## Scope

**In (MVP, authenticated crew + owner):**
- Granular **trackable items per phase** (the 6 phases: design → cnc → assembly →
  finishing → delivery → install), each with a status that cycles.
- Crew update item status from a **mobile-first** view; attach **notes + photos**.
- **Visibility tag** on every item and event (`owner | client | both`, default
  `owner`) — stored now, enforced when the portal lands.
- **Owner live board:** all active jobs with per-phase progress bars, updating in
  real time; drill into a job for the item timeline + photos.

**Out (later layers — all ride on this same model, none built here):**
- **Client portal** (token route `/j/<token>`) — layer 2.
- **Installer daily log** (shop-needs-for-tomorrow, defective pieces) — layer 2/3.
- **Scheduling / ETA prediction** — separate feature.
- **Notifications** (email/SMS) — needs new infra (none exists today).

## Reused patterns (this is additive, not from-scratch)

- **Realtime + status cycling** → Drawings `features/drawings/lib/piecesStore.tsx`
  (`supabase.channel` + `postgres_changes`, optimistic writes).
- **Token-gated public access** (for the later portal) → Forms share links
  (`features/forms/lib/shareLink*.ts`, `src/app/f/[token]/`, service-role +
  server-side `filterLockedAnswers`).
- **Phase model** → `jobs.current_milestone` + `MilestoneStage` union
  (`shared/lib/types.ts`).
- **Mobile field UI** → Installer (`features/installer`).

## Architecture — "A★": unify at the interface, never duplicate data

Each trackable item lives in exactly **one** home table; a read-layer adapter
presents them as one model. No mirroring (avoids drift).

```
            ┌─ Drawings pieces (extended: +visibility)  ─┐   delivery/install
trackable ──┤                                            ├─→ one live board
  item      └─ job_items (new: template/adhoc steps)     ─┘   + progress %
                         │
              job_item_events (status/note/photo + visibility)  ← timeline / portal filter
```

### Data model

**New — `phase_step_templates`** (standard steps per phase, defined once):
- `id uuid pk`, `phase text` (design|cnc|assembly|finishing|delivery|install),
  `label text`, `sort_order int`, `default_visibility text default 'owner'`,
  `active boolean default true`.
- Delivery/install carry few/no template steps — pieces cover them.

**New — `job_items`** (per-job trackable items from templates or ad-hoc; NOT pieces):
- `id uuid pk`, `job_id text fk → jobs.id`, `phase text`, `label text`,
  `source text` (`template | adhoc`), `template_id uuid null`,
  `status text` (`not_started | in_progress | blocked | done`),
  `visibility text default 'owner'`, `sort_order int`,
  `created_at timestamptz`, `updated_at timestamptz`.

**Extend — Drawings `pieces`** (single source of truth for delivery/install items):
- add `visibility text not null default 'owner'`. (Status already exists.)

**New — `job_item_events`** (append-only log across BOTH sources — timeline + daily-log seed):
- `id uuid pk`, `job_id text`, `item_kind text` (`job_item | piece`),
  `item_id text` (the referenced item's id), `event_type text`
  (`status_change | note | photo`), `to_status text null`, `note text null`,
  `photo_path text null` (Storage path), `visibility text default 'owner'`,
  `worker_id uuid null` (auth.uid), `created_at timestamptz default now()`.

**Storage:** private `job-progress` bucket for field photos (RLS authenticated).

**RLS:** all new tables `authenticated_all | anon_none` (project standard). Pieces
unchanged. `visibility` is *stored* in the MVP but not yet a boundary (no external
reader exists until the portal layer).

### Read layer + realtime

- **`useJobProgress(jobId)`** hook (mirrors `piecesStore`): one Supabase channel,
  `postgres_changes` on `job_items` + `pieces` + `job_item_events` filtered by
  `job_id`; optimistic local mutation then persist; idempotent merge by id.
- **Adapter** maps `job_items` and `pieces` → a common `TrackableItem`
  `{ id, kind: 'job_item'|'piece', phase, label, status, visibility, done }`.
  Pure, unit-testable. **`done` is normalised per kind** because the two sources
  have different status vocabularies: a `job_item` is done when `status = 'done'`;
  a `piece` is done at its terminal status (e.g. `installed`) per the Drawings
  `pipelines.ts` lifecycle. The adapter owns this mapping so progress math never
  sees raw per-kind statuses.
- **Progress:** per-phase % = `done ÷ total` items in that phase; job % rolls up
  across phases. Pure function over the normalised `done` flag.

### UI surfaces

- **Field view (mobile/PWA)** — route `/status` + a tab on job detail. Job →
  phases as sections → items as **tap-to-cycle** rows (advance status). Per item:
  add a note + photo, set visibility (defaults owner). Mobile-first, extends the
  Installer card pattern.
- **Owner live board** — all active jobs with per-phase progress bars, updating in
  real time; drill into a job → item timeline with photos.

## Error handling

- Optimistic writes roll back on Supabase error (surface a toast; don't lose the
  tap silently — anti-pattern: silent failure).
- Photo upload failures keep the status change (status and photo are separate
  events); the photo event is retried/surfaced, never silently dropped.
- Unknown/legacy status or visibility values render a safe read-only fallback
  (mirrors the Forms field-registry safe-fallback rule).

## Testing

- **Vitest:** progress math (mixed job_items + pieces), status-cycle transitions,
  adapter merge, visibility default = owner.
- **Playwright smoke (CI, seeded Supabase):** cycle an item → persists + visible
  on reload; photo → lands in Storage; realtime change propagates.
- **pgTAP:** RLS — deferred to the portal layer (where the boundary becomes real).

## Slice plan (tracer-first; each ships to `main`, ADR 0017)

1. **🛑 Tracer (schema):** `job_items` + `job_item_events` + `pieces.visibility` +
   `phase_step_templates` + `job-progress` bucket. Cycle ONE item's status on a
   job → persists → basic per-job view. *Gate: schema migration.*
2. **Templates + full field view:** instantiate template steps per phase; full
   mobile view (all phases, tap-to-cycle, progress %).
3. **Photos + notes:** event log with Storage photos + per-job timeline.
4. **Fold in pieces:** adapter unifies Drawings pieces (`piece.visibility`) into
   the board — delivery/install show real pieces.
5. **Owner live board:** all active jobs, multi-job realtime, progress bars.
6. **Visibility tagging UI:** set owner/client/both per item/event.

**Layer-2 (separate milestone, later):** client portal token route `/j/<token>`
(🛑 auth boundary) · installer daily log · notifications · scheduling/ETA.

## Definition of done (MVP)

Crew can open a job on their phone, tap items through their statuses across phases
(template steps + ad-hoc), attach notes/photos, and tag each owner/client/both;
the owner sees a live board of all jobs with per-phase progress that updates in
real time, drilling into any job's photo timeline — all authenticated + RLS-locked,
with the visibility filter stored and ready for the future client portal to switch
on as a pure filter.

## Open questions / deferred decisions

- Exact default template steps per phase (content) — gather from Andrew during
  slice 2 (the SOP content, not an architecture question).
- Whether ad-hoc items need a per-job "add item" affordance in MVP or can wait —
  default: include a minimal add in slice 2.
- Photo retention / compression policy — revisit if Storage volume grows.
