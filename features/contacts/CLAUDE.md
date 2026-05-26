# Contacts

The real contacts table that replaces the derived-from-jobs `/crm`
view. People and orgs, multi-select role tags, anchor-relationship
warmth tracking, and 5 typed FK slots linking Jobs to Contacts.

## What it does

Single Supabase table (`public.contacts`) holding every party Spacecraft
Joinery has a relationship with — designers, GCs, architects, homeowners,
and the in-between cases. Surfaces in three places today:

- **`/crm`** — anchors first, then by lifetime revenue desc. Left-edge
  clay status-dot pins anchors; warmth chip fires when an anchor goes
  >30 days without a touch.
- **`/crm/[id]`** — Linked Jobs is the hero (economic story). Profile
  facts in a quiet sidebar. Introduced Clients subtable.
- **`/jobs/new`** + **`/jobs/[id]`** — the Payer slot is required and
  visible by default. Designer / GC / Architect / Homeowner live behind
  progressive disclosure (`+ Add ...`). JobDetail OverviewTab gets a
  Parties card listing populated slots only.

The daily Briefing surfaces stale-anchor nudges as briefing items
themselves (not as a competing subsection inside the briefing card).

## Where things live

```
features/contacts/
├── CLAUDE.md
├── lib/
│   ├── aggregate.ts            (ContactRollup, rollupContacts, sortContactsForList, rollupIntroducedClients, daysSince)
│   ├── contactsRowMap.ts       (Supabase row <-> Contact conversion)
│   └── contactsStore.tsx       (ContactsProvider, useContacts, useContact, touchContact)
└── components/
    ├── ContactsList.tsx        (the /crm index table)
    ├── RoleTagPills.tsx        (neutral surface-muted pills)
    └── WarmthChip.tsx          (clay-soft chip with mono day count, anchor-only, >=30d)
```

`features/crm/` becomes a thin shell: `CrmView` renders the
ContactsList. `ClientsTable` and `features/crm/lib/aggregate.ts` will
be removed once the read paths are fully migrated.

## Design contracts (locked from /impeccable craft review 2026-05-25)

These override the original grill answers wherever they conflict. Full
context in `docs/plans/crm-contacts.md`.

- **`/jobs/new`** shows Payer required + visible; the other four slots
  live behind progressive disclosure (`+ Add designer/GC/architect/
  homeowner`). PRODUCT.md max-4-primary-options.
- **"+ Create contact"** from a combobox is an inline expanding
  mini-form, NOT a Modal. Modal slot reserved for delete-confirm only.
- **WarmthChip** uses clay-soft, not amber. Amber is reserved for
  `--status-at-risk` (semantic axis). Clay-soft is on-brand and earns
  full-saturation surface under the Rare-Accent Rule.
- **No em dashes** in any UI copy. Shared /impeccable absolute ban.
- **`/crm/[id]`** focal point is Linked Jobs; profile in sidebar;
  Introduced Clients below or in a secondary tab.
- **RoleTagPills:** neutral surface-muted text-secondary. Stays out of
  pipeline (taupe/clay) and health (sage/amber/red) colour axes.
- **Anchor pinning:** 8px clay status-dot at the left edge of anchor
  rows in ContactsList. Eight-feet glance test.
- **"Touched today"** button on `/crm/[id]` is a ghost button, not
  ink-pill. Metadata update, not primary CTA.
- **Briefing nudges** for stale anchors enter as briefing items
  themselves, ranked by `last_touched_at`. No competing subsection.
- **`/crm` empty state** teaches the next action (serif headline +
  body + ink-pill "Create contact").

## Domain notes

- **Polymorphic single table** holds people and orgs. `kind` is
  `'person' | 'org'`, enforced via DB CHECK constraint.
- **Role tags** are a `text[]` multi-select: `'designer'`, `'architect'`,
  `'gc'`, `'homeowner'`. Validated in TypeScript only (`RoleTag` union)
  so we can add new tags without a migration. Kitchencraft and Toolpath
  arrived with empty `role_tags` — Andrew re-tags in the UI.
- **Self-FKs** carry two relationships: `parent_id` (people belong to
  orgs), `introduced_by_id` (who referred this contact to us). Both
  `ON DELETE SET NULL`.
- **5 typed slots on `public.jobs`:** `payer_id` (NOT NULL,
  `ON DELETE RESTRICT`), `designer_id`, `architect_id`, `gc_id`,
  `homeowner_id` (all optional, `ON DELETE SET NULL`).
- **`last_touched_at`** is bumped automatically by a DB trigger on any
  job INSERT/UPDATE that references the contact via one of the 5 slot
  FKs. The manual "Touched today" button on `/crm/[id]` hits the
  column directly via `useContacts().touchContact(id)` for off-job
  touches (the coffee-with-Raubyn case).
- **`is_anchor`** is the binary "strategic relationship" flag. Anchors
  get pinned to the top of `/crm` and surfaced as briefing items when
  stale. Currently true only for Raubyn Design Studio.
- **Soft delete** via `archived_at`. The default `/crm` list filters
  these out; an explicit "Show archived" toggle (later commit) brings
  them back.
- **Persistence** mirrors jobs: Supabase when env present, localStorage
  (`gw_contacts_v1`) fallback. Initial seed lives in the migration's
  backfill, not in code.

## When to revisit

- **Drop `jobs.client` text column** — once every read path uses
  `payerId` lookups against the contacts store, the legacy column can
  go. Migration is a single `ALTER TABLE jobs DROP COLUMN client`.
- **Multi-contact-per-org rollup view** — when Spacecraft has 20+
  people across Raubyn's studio, the /crm/[id] page for the org needs
  to summarise the people underneath. Out of scope for this iteration.
- **Communication history** (calls, emails, meeting notes per contact)
  — real CRM territory. Plan as its own feature.
- **Fuzzy de-dupe** — typeahead in `ContactCombobox` prevents most
  splits; an explicit "merge contacts" tool comes when the list grows
  past ~50.

## What this feature does NOT own

- Cross-feature UI primitives (`Pill`, `Modal`, `FormField`,
  `StatusDot`) → `shared/components/`
- The Job slot FKs as Job-level write logic → `features/jobs/lib/jobsRowMap.ts`
  and `features/jobs/lib/jobsStore.tsx`
- Briefing-item generation → `features/briefing/lib/`
