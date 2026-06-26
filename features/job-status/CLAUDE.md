# Job Status (live job progress)

Field/shop crew update where each job is — granular items per phase, from their
phones — and the owner sees a **live** progress board across all jobs. The internal,
owner-facing foundation for a future **client portal** (clients watch their job
progress live) and **installer daily log**. Internal-first so the data is proven
before anything is exposed externally.

Read `CONTEXT.md` (glossary) first — `trackable item`, `visibility`, `event`, and
`done`-normalisation are load-bearing. Full design + rationale:
`docs/superpowers/specs/2026-06-25-live-job-status-design.md`.

## ⚠️ AUTONOMOUS OVERNIGHT BUILD — MANDATORY CONSTRAINTS (every slice)

This milestone (#5) is being built unattended with the owner's explicit
authorization (chained after milestone #4). **Every slice MUST obey these:**

1. **Feature-flag everything OFF in production.** Gate the `/status` route, its nav
   entry, the job-detail tab, and any job-status code path behind a single flag
   (`JOB_STATUS_ENABLED`, env; **absent/false = off**). Prod stays dormant until the
   owner flips it on after review. **Enable the flag in dev/test/CI** so the
   Playwright smoke can run (a smoke blocked by an off flag won't pass CI).
2. **Additive-only migrations.** `CREATE TABLE`/`ADD COLUMN` (nullable) only —
   including the Drawings `pieces.visibility` column (slice 4): it MUST be
   `ADD COLUMN visibility text NOT NULL DEFAULT 'owner'` (additive, safe), never a
   destructive alter. **No** `DROP` / row mutation. The owner reviews + applies all
   migrations to prod *after* the run — **do NOT apply any migration to prod.**
3. **Never weaken existing RLS/auth**; do not alter existing Drawings behaviour
   beyond adding the nullable `visibility` column. New tables are `authenticated_all
   | anon_none`.
4. CI green is non-negotiable before merge.

## Architecture (A★ — unify at the interface, never duplicate)

Each item lives in exactly one home table; a read-layer adapter presents one model.

```
            ┌─ Drawings pieces (extended: +visibility)  ─┐   delivery/install
trackable ──┤                                            ├─→ one live board
  item      └─ job_items (new: template/adhoc steps)     ─┘   + progress %
                         │
              job_item_events (status/note/photo + visibility)  ← timeline / portal filter
```

**Reuses proven patterns — additive, not from-scratch:**
- Realtime + tap-to-cycle → Drawings `features/drawings/lib/piecesStore.tsx`
  (`supabase.channel` + `postgres_changes`, optimistic writes). **No home server —
  Supabase Realtime pushes changes to every client.**
- Phase model → `jobs.current_milestone` + `MilestoneStage` (`shared/lib/types.ts`).
- Mobile field UI → Installer (`features/installer`).
- (Later) token portal → Forms share links (`features/forms/lib/shareLink*.ts`).

## Data model

- **New `phase_step_templates`** — standard steps per phase (`phase`, `label`,
  `sort_order`, `default_visibility` default `owner`, `active`).
- **New `job_items`** — per-job items (`job_id`, `phase`, `label`, `source`
  template|adhoc, `template_id?`, `status` not_started|in_progress|blocked|done,
  `visibility` default `owner`, `sort_order`). NOT pieces.
- **Extend Drawings `pieces`** — add `visibility` default `owner` (status exists).
- **New `job_item_events`** — append-only (`job_id`, `item_kind` job_item|piece,
  `item_id`, `event_type` status_change|note|photo, `to_status?`, `note?`,
  `photo_path?`, `visibility` default `owner`, `worker_id?`, `created_at`).
- **Storage:** private `job-progress` bucket for field photos.
- **RLS:** all new tables `authenticated_all | anon_none`. `visibility` stored but
  not yet a boundary (no external reader until the portal layer).

## Conventions

- Folder `features/job-status/` (`components/*.tsx`, `lib/*.ts`); thin route
  `src/app/status/page.tsx` + a tab on job detail. Mobile-first.
- `useJobProgress(jobId)` hook mirrors `piecesStore` (one channel, optimistic,
  idempotent merge). The adapter + progress math are **pure + unit-tested**.
- Money n/a here. Supabase + RLS authenticated. Timestamped SQL migrations.
- Optimistic writes roll back + toast on error (no silent failure). Unknown
  status/visibility → safe read-only fallback (Forms field-registry rule).

## Non-goals (this milestone — all ride on this same model, built later)

- **Client portal** (token route `/j/<token>`) — its own slice/milestone, a 🛑
  auth boundary.
- **Installer daily log** (shop-needs-for-tomorrow, defective pieces).
- **Scheduling / ETA prediction** — separate feature.
- **Notifications** (email/SMS) — needs new infra (none today).

## Definition of done (MVP)

Crew open a job on their phone, tap items through statuses across phases (template
steps + ad-hoc), attach notes/photos, tag each owner/client/both; the owner sees a
live board of all jobs with per-phase progress updating in real time, drilling into
any job's photo timeline — authenticated + RLS-locked, visibility stored and ready
for the portal to switch on as a pure filter.
