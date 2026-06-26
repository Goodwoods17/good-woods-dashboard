# Job Status — glossary (read before touching this feature)

Full design rationale: `docs/superpowers/specs/2026-06-25-live-job-status-design.md`.

- **Trackable item** — anything whose progress a worker cycles on a job. Two
  physical homes, one read-layer interface: a **`job_item`** (new table: template
  steps + ad-hoc) or a **Drawings piece** (existing `pieces` table, for
  delivery/install). Never duplicated across the two — the adapter unifies them at
  read time only.
- **Phase** — one of the 6 job phases: design → cnc → assembly → finishing →
  delivery → install. Reuses `MilestoneStage` (`shared/lib/types.ts`).
- **Status** — an item's progress state. `job_item`: `not_started | in_progress |
  blocked | done`. Piece: its existing Drawings lifecycle (cut → … → installed).
  The adapter normalises both to a `done` boolean for progress math.
- **`done` (normalised)** — kind-specific: a `job_item` is done at `status='done'`;
  a piece is done at its terminal status (e.g. `installed`). Progress math only
  ever sees this normalised flag, never raw per-kind statuses.
- **Visibility** — `owner | client | both` on every item AND every event.
  **Default `owner`.** The owner sees everything; the future client portal renders
  only `client | both`. Stored from day one; becomes an enforced boundary only when
  the portal layer ships. Nothing reaches a client unless explicitly promoted.
- **Event** — an append-only `job_item_events` row: a status change, a note, or a
  photo, carrying its own visibility + worker + optional Storage photo. This is the
  per-job **timeline** and the seed of the future installer daily log.
- **Phase step template** — a standard step defined once per phase
  (`phase_step_templates`), auto-instantiated into `job_items` for a job. Doubles
  as an SOP. (Delivery/install carry few/none — pieces cover them.)
- **Progress** — per-phase % = done ÷ total items in that phase; job % rolls up
  across phases. Pure function over normalised `done`.
- **Owner live board** — the owner's real-time view of all active jobs with
  per-phase progress bars; drill into a job for its item timeline + photos.
- **Field view** — the mobile/PWA surface where crew tap items through statuses and
  attach notes/photos. Authenticated crew, not a client surface.

Deferred layers (same plumbing, separate milestone): **client portal** (token route
`/j/<token>`), **installer daily log**, **scheduling/ETA**, **notifications**.
