# Forms — domain glossary

The precise vocabulary for the Forms (form builder) feature. A glossary, not a
spec — implementation lives in `CLAUDE.md` / `PLAN.md`. When code or conversation
uses one of these words to mean something else, that's a conflict to resolve, not
a synonym. (Locked in the grill-with-docs session, 2026-06-25 — issue #32.)

## Form template

The **master** — a reusable definition of a form (its field defs, ordered). Lives
in `form_templates` + `form_template_fields`. The owner designs these once and
reuses them across jobs. NEVER call this a bare "template" (collides with **Job
template**, ADR 0012) or a "checklist" (collides with the **piece checklist** in
`features/drawings`). Always "form template".

## Form instance

The **filled copy** — one form attached to a job (or standalone), holding the
filler's answers. Lives in `form_instances` + `form_instance_fields`. Created by
**snapshotting** a form template.

## Snapshot

The act (and result) of copying a form template's field defs (label / type /
config) into a new form instance at **attach time**. The copy is **frozen**:
editing the master never disturbs instances already on jobs — not even while the
instance is still a draft. Masters flow only to _future_ instances. The single
copy point is `lib/snapshot.ts::snapshotTemplate`.

## Field

One row in a form, identified by its `type` (a `FieldType`) plus a small JSON
`config`. The **field-registry model**: every field is a row, so new field types
never need a migration — just a new `type` string + one registry entry + one fill
control. v1 ships `section` + `checkbox`; the rest land in later slices.

## Field type

A member of the `FieldType` union (`shared/lib/types.ts`), validated in
TypeScript — **not** a DB enum. `section` is a layout heading (not answerable);
the rest carry answers. An unknown or not-yet-implemented type renders a safe
read-only fallback (the forward-compat invariant — never crash).

## Field registry

The typed record keyed by `FieldType` (`lib/fieldRegistry.ts`) carrying each
type's metadata + completion gate (`isComplete`). The React fill controls live in
the sibling `lib/fieldControls.tsx` so the registry stays JSX-free + unit-testable.

## Phase tag

A nullable `FormPhase` on a form template (`design | cnc_cut | assembly |
finishing | delivery | install`, or null = unphased) — the 6-phase spine
(ADR 0008). The form instance **snapshots** the template's phase so the job Forms
tab can group / sort by phase. Distinct from `MilestoneStage` (`cnc_cut` vs `cnc`)
because this is a form-domain tag, not the milestone key.

## Status

A form instance's lifecycle: `draft → in_progress → complete` (`FormStatus`).
Touching any field on a draft bumps it to `in_progress`. `complete` (lock + PDF
signoff) lands in a later slice.

## Default form

A form template flagged `is_default`. In a later slice these auto-attach to every
new job. Pre-Install Check + Shop-Drawing Review are seeded as defaults.

## Standalone instance

A form instance with `job_id = null` — a filled form not tied to any job. The fill
path supports it (snapshot accepts a null job); the standalone UI lands in slice 2.
