# Job Status — implementation plan

Vertical slices in dependency order, tracer first. Each ships independently to
`main` (ADR 0017 — no stacked PRs). Spec: `CLAUDE.md` · glossary: `CONTEXT.md` ·
design: `docs/superpowers/specs/2026-06-25-live-job-status-design.md`.

**Build is HELD** (like invoices, milestone #4). New `features/job-status` folder.
Pre-flight before Phase B: this slice **extends the Drawings `pieces` table**
(slice 4) and reads Drawings lib — watch for overlap with any in-flight Drawings
work; new tables otherwise isolated.

Gate legend: 🛑 = stop-and-ping before merge even in auto-mode (schema / auth).

## File structure (where things live)

- `supabase/migrations/<ts>_job_status.sql` — `phase_step_templates`, `job_items`,
  `job_item_events`, `pieces.visibility`, `job-progress` Storage bucket, RLS.
- `features/job-status/lib/types.ts` — `TrackableItem`, `JobItem`, `JobItemEvent`,
  status/visibility unions.
- `features/job-status/lib/adapter.ts` — pure: maps `job_items` + `pieces` →
  `TrackableItem[]` with normalised `done`. Unit-tested.
- `features/job-status/lib/progress.ts` — pure: per-phase + job % over `done`.
- `features/job-status/lib/jobProgressStore.tsx` — `useJobProgress(jobId)`:
  realtime channel, optimistic mutations, persist. Mirrors `piecesStore`.
- `features/job-status/lib/templates.ts` — instantiate `phase_step_templates` →
  `job_items` for a job.
- `features/job-status/components/JobStatusTab.tsx` — per-job field view (phases →
  tap-to-cycle items + note/photo + visibility).
- `features/job-status/components/StatusBoard.tsx` — owner live board (all jobs).
- `features/job-status/components/ItemTimeline.tsx` — event timeline + photos.
- `src/app/status/page.tsx` — thin route → `StatusBoard`.

---

## Slice 1 — Tracer (schema + one live status cycle) 🛑 schema

- Migration: `job_items` + `job_item_events` + `pieces.visibility` +
  `phase_step_templates` + `job-progress` bucket. RLS authenticated.
- `useJobProgress(jobId)` minimal (subscribe + optimistic cycle on `job_items`).
- A basic per-job view: one seeded `job_item` cycles `not_started → in_progress →
  done`, persists, re-renders live.

**Done when:** a job shows one trackable item; tapping it cycles + persists +
updates live on reload; migration applied. tsc+lint+build+tests green; Playwright
smoke covers the cycle.

## Slice 2 — Templates + full field view

- `phase_step_templates` seeded with a starter set per phase (gather exact step
  labels from Andrew — SOP content, not architecture).
- `templates.ts` instantiates steps → `job_items` for a job (idempotent).
- `JobStatusTab`: all 6 phases as sections, items as tap-to-cycle rows, per-phase +
  job progress %; minimal "add ad-hoc item".

**Done when:** opening a job materialises its template steps across phases; crew can
cycle any item and add an ad-hoc one; progress bars compute correctly (Vitest on
`adapter`/`progress`).

## Slice 3 — Photos + notes (event timeline)

- Note + photo capture on an item → `job_item_events` (+ Storage upload).
- `ItemTimeline` renders the per-job event stream with photos.
- Photo upload failure is surfaced/retried, never silently dropped; status change
  and photo are separate events.

**Done when:** a worker attaches a note + photo to an item; it appears on the job
timeline; photo lands in the `job-progress` bucket; failures toast, not vanish.

## Slice 4 — Fold in Drawings pieces

- Extend `adapter.ts` to merge `pieces` (delivery/install) into `TrackableItem[]`
  with normalised `done` (terminal piece status, per Drawings `pipelines.ts`).
- `useJobProgress` also subscribes to `pieces` changes for the job.
- Pieces show in the board/timeline; `piece.visibility` editable.

**Done when:** a job's delivery/install phases show real Drawings pieces alongside
template items in one unified view; cycling a piece updates progress; no data
duplicated (pieces stay in their table).

## Slice 5 — Owner live board

- `StatusBoard` at `/status`: all active jobs, per-phase progress bars, multi-job
  realtime; drill into a job → `JobStatusTab` + `ItemTimeline`.

**Done when:** the board lists active jobs with live progress; a field update on one
job reflects on the board within the realtime round-trip; drill-in works.

## Slice 6 — Visibility tagging UI

- Set `visibility` (owner | client | both) per item and per event; default owner;
  clear visual indicator of what's client-facing.

**Done when:** any item/event can be tagged owner/client/both, defaulting owner,
with the client-facing ones clearly marked — so the future portal is a pure filter.

---

## Layer-2 backlog (separate milestone, later)

- **Client portal** — token route `/j/<token>` via service role, returns only
  `visibility ∈ {client, both}` (mirror Forms `filterLockedAnswers`). 🛑 auth
  boundary; pgTAP RLS tests land here.
- **Installer daily log** — structured shop-needs-for-tomorrow + defective-piece
  capture, reusing `job_item_events` + visibility.
- **Notifications** (email/SMS) — new infra (Resend/Twilio).
- **Scheduling / ETA** — phase durations + predicted dates; its own feature.
