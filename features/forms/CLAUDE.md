# Forms (form builder)

A general form builder for repeatable shop knowledge — pre-install checks, design
intakes, shop-drawing reviews, and "whatever I need next." Not three hard-coded
checklists: the owner designs reusable **form templates** (any mix of field
types), attaches them to jobs, and fills a touch-friendly per-job copy.

Read `CONTEXT.md` (the glossary) before touching this feature — the vocabulary is
load-bearing (form template vs Job template vs piece checklist).

## What it does (slice 1 — tracer)

A thin vertical slice through every layer: DB → row maps → stores → `/forms`
listing → job Forms tab → fill → persist (both backends).

- **`/forms`** lists the seeded form templates (read path).
- **Job detail → Forms tab** (`JobFormsTab`) — manually attach a template to a
  job (snapshots its fields into a new instance), tick checkboxes / read section
  headings, persists to Supabase and the localStorage fallback.

Field types in this slice: **section + checkbox** only. The field-type **registry**
scaffold is in place (one entry per type) so later types drop in locally.

## Field-registry architecture (the spine)

Every field is a row with a `type` (a `FieldType`, validated in TS — not a DB
enum) + a small JSON `config`. New field types later = add the string to the
`FieldType` union + one `fieldRegistry` entry + one `fieldControls` control. **No
migration, no store change, no JobDetail change.**

- `lib/fieldRegistry.ts` — pure (JSX-free) metadata + `isComplete` per type, keyed
  by `FieldType`. Unit-testable under the node vitest env.
- `lib/fieldControls.tsx` — the React fill controls (`section`, `checkbox`). Only
  UI imports this; tests never do (keeps the registry pure).
- An unimplemented (later-slice) or unknown (future) type renders a **safe
  read-only fallback** — never crashes.

## Snapshot invariant

When a template is attached, the instance **copies** the template's field defs at
attach time (`lib/snapshot.ts::snapshotTemplate`). The copy is **frozen** —
editing a master never disturbs instances already on jobs, even while the instance
is still a draft. The instance also snapshots the template's **phase** tag.

## Where things live

```
features/forms/
├── CLAUDE.md / PLAN.md / CONTEXT.md
├── lib/
│   ├── fieldRegistry.ts          (pure registry: metadata + isComplete, per FieldType — all 10 wired)
│   ├── fieldControls.tsx         (React fill controls for every type, incl. photo + signature pad)
│   ├── storage.ts                (form-photos bucket: upload photo / signature PNG / resolve / remove, data: fallback)
│   ├── snapshot.ts               (snapshotTemplate — the single snapshot point)
│   ├── phase.ts                  (FormPhase labels)
│   ├── formTemplatesRowMap.ts    (row ↔ FormTemplate / FormTemplateField)
│   ├── formInstancesRowMap.ts    (row ↔ FormInstance / FormInstanceField)
│   ├── formTemplatesStore.tsx    (FormTemplatesProvider, useFormTemplates)
│   ├── formInstancesStore.tsx    (FormInstancesProvider, useFormInstances + attachTemplate)
│   └── formRowMaps.test.ts       (row-map round-trips + snapshot + registry)
└── components/
    ├── FormsBuilderView.tsx      (/forms listing)
    ├── JobFormsTab.tsx           (job detail Forms tab: attach + fill)
    └── FormFillSurface.tsx       (renders an instance's fields via the registry)
```

## Persistence

Dual-mode like the rest of the app: Supabase when configured, localStorage
(`gw_form_*_v1`) fallback. Templates are seeded in the migration. Stores mounted
in `src/app/layout.tsx` (`FormTemplatesProvider` outer, `FormInstancesProvider`
inner). RLS = authenticated-only + anon-none on all 4 tables. Private `form-photos`
bucket stood up now (photos land in slice 3).

## Non-goals (this slice)

- Template CRUD / dnd-kit reorder / mark default+active (slice 2).
- `attachDefaultForms` auto-attach on `/jobs/new` + standalone forms (slice 2).
- ~~Lock + PDF signoff (slice 4)~~ — **shipped (#35).** `completeInstance`
  gates on the registry `isComplete` per field, locks the fill surface read-only
  (`status === "complete"`), and `FormSignoffDocument` (react-pdf) renders every
  field type incl. embedded photo + signature `<Image>` plus the
  completed-by/signer/timestamp audit block. Owner can `reopenInstance` (voids
  the prior `signoff_path` PDF). See `lib/completion.ts` / `lib/signoff.ts` /
  `components/FormCompletionBar.tsx`.
- The client token-link fill portal (Phase 2 — touches the auth boundary).

## What this feature does NOT own

- Cross-feature UI primitives (`Modal`, `Button`) → `shared/components/`.
- The Job (Forms tab is rendered by `features/jobs/JobDetail`, which calls
  `<JobFormsTab jobId={…} />`).
- Storage helpers shared with reface → cloned per-feature in slice 3.
