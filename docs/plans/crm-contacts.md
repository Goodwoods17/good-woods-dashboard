# Plan — CRM Contacts feature for good-woods-dashboard

**Date:** 2026-05-25
**Branch:** `feat/crm-contacts`
**Origin:** grill-me session 2026-05-25 (Q1–Q7); design contracts from `/impeccable craft` review 2026-05-25.

## Context

Today `/crm` is a read-only view derived from jobs: it groups jobs by exact-string-match on `job.client` and shows lifetime revenue per client. There is no way to:

- **Create a contact without an active job.** Raubyn at Rothschild West Design — who drives ~30% of revenue per memory and whose loss would damage the business — cannot be tracked between jobs. The relationship that matters most has no representation.
- **Distinguish designer from payer.** Today's `job.client` collapses three real parties (designer, GC/payer, homeowner) into one free-text string. The Raubyn-leverage view ("how many clients has Raubyn introduced and what's their lifetime revenue?") is not derivable.
- **Avoid silent string-split bugs.** Typing "Raubyn Studio" on one job and "Raubyn / Rothschild" on another splits the lifetime revenue across two phantom clients. There is no autocomplete or de-dupe.

This plan adds a real `contacts` table with role tags, links Jobs to contacts via five typed slots, and surfaces "warmth" of anchor relationships in the daily briefing.

## Design contracts (locked from `/impeccable craft` review)

These override the original grill answers wherever they conflict. Every UI commit must honour these.

### P0 (block before any UI ships)

1. **`/jobs/new` shows Payer required by default; the other four slots live behind progressive disclosure.** A single "+ Add designer / GC / architect / homeowner" affordance expands each slot inline on click. (Original grill Q6a said "all 5 visible"; that violates PRODUCT.md §Accessibility max-4-primary-options + Design Principle #2 one-primary-action-per-surface.)

2. **"+ Create contact" from the combobox is an inline expanding mini-form, NOT a Modal.** Slides in below the combobox. The Modal slot is reserved for the destructive-confirm case ("Cannot delete. Linked to N jobs.").

3. **WarmthChip uses clay-soft (`bg-accent-soft text-accent`), NOT amber.** Amber is reserved for `--status-at-risk` (semantic). Relationship warmth is on-brand for clay; this is one of the few places clay-soft surfaces earn their keep under the Rare-Accent Rule. Day count renders in JetBrains Mono, tabular-nums.

4. **No em dashes in any UI copy.** Shared `/impeccable` absolute ban. Concrete rewrites:
   - Briefing nudge: *"Raubyn. 47 days since last touch. Pour her a coffee."*
   - Delete error: *"Cannot delete. Linked to N jobs."*

### P1 (build-phase design rules)

5. **`/crm/[id]` focal point is Linked Jobs (the economic story).** Profile facts sit in a quiet sidebar; Introduced Clients lives below the fold or in a secondary tab. Do not stack 3 ICs of equal weight.

6. **RoleTagPills:** `bg-surface-muted text-text-secondary` neutral pills. Stay out of the pipeline (taupe/clay) and health (sage/amber/red) colour axes; those are reserved semantics.

7. **Anchor pinning:** left-edge 8px clay status-dot on anchor rows in `ContactsList`, mirroring the eight-feet-glance pattern from `/` Hitlist. This is the ONE place clay surface-fill earns its keep on this surface.

8. **"Touched today" button is a ghost button, not ink-pill.** It's a metadata update, not a primary CTA.

9. **Anchor staleness nudges live as briefing items themselves, not as a competing subsection inside the briefing.** Stale anchors get priority-ranked into the daily briefing's existing item list. (Avoids the two-ICs-per-view ban.)

10. **`/crm` empty state:** serif headline "No contacts yet" + body "Track a designer, GC, or homeowner before the next job lands." + ink-pill "Create contact". Teach the next action.

## Approach

### 1. New table: `contacts` (Supabase, single-user M2 anon CRUD)

Polymorphic single table holds people and orgs. Multi-select role tags. Self-FK for org membership (`parent_id`) and for referral relationships (`introduced_by_id`).

```sql
CREATE TABLE contacts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind              text NOT NULL CHECK (kind IN ('person', 'org')),
  parent_id         uuid REFERENCES contacts(id) ON DELETE SET NULL,
  name              text NOT NULL,
  role_tags         text[] NOT NULL DEFAULT '{}',
  emails            jsonb NOT NULL DEFAULT '[]',
  phones            jsonb NOT NULL DEFAULT '[]',
  address           text,
  website           text,
  notes             text,
  introduced_by_id  uuid REFERENCES contacts(id) ON DELETE SET NULL,
  is_anchor         boolean NOT NULL DEFAULT false,
  last_touched_at   timestamptz,
  follow_up_at      date,
  archived_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

Indexes on `parent_id`, `introduced_by_id`, `is_anchor`, `last_touched_at`, `role_tags` (GIN), `archived_at`. RLS enabled, anon-CRUD policy (M2 single-user posture).

Valid `role_tags` values: `'designer'`, `'architect'`, `'gc'`, `'homeowner'`. Enforced in TypeScript, not in DB CHECK (so we can add tags without migrations).

### 2. Job FK slots

```sql
ALTER TABLE jobs
  ADD COLUMN payer_id      uuid REFERENCES contacts(id) ON DELETE RESTRICT,
  ADD COLUMN designer_id   uuid REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN architect_id  uuid REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN gc_id         uuid REFERENCES contacts(id) ON DELETE SET NULL,
  ADD COLUMN homeowner_id  uuid REFERENCES contacts(id) ON DELETE SET NULL;
```

Existing `jobs.client text` column kept for one release as display fallback; dropped in a follow-up migration once the new path is stable.

### 3. Migration: backfill 6 contacts

Production has exactly 6 distinct `jobs.client` values (verified via Supabase MCP 2026-05-25). Migration inserts them with curated `kind`, `role_tags`, and the Raubyn anchor flag, then links each job's `payer_id`.

Anika Patel (person, homeowner), Linda Smith (person, homeowner), Raubyn Design Studio (org, designer, **anchor**), SayWell Developments (org, gc), Kitchencraft Trade (org, no tags), Toolpath Workshop (org, no tags).

Then `ALTER TABLE jobs ALTER COLUMN payer_id SET NOT NULL`.

### 4. `last_touched_at` auto-update trigger

`AFTER INSERT OR UPDATE ON jobs` trigger bumps `last_touched_at = now()` on any contact referenced by the row's 5 slot FKs. Plus a manual "Touched today" (ghost button) on `/crm/[id]` for relationship-touches not tied to a job — the coffee-with-Raubyn case.

End the migration file with `NOTIFY pgrst, 'reload schema';` per architectural rule.

### 5. TypeScript types (`shared/lib/types.ts`)

- `Contact`, `ContactKind = 'person' | 'org'`, `RoleTag = 'designer' | 'architect' | 'gc' | 'homeowner'`
- `EmailEntry = { label: string; value: string }`, `PhoneEntry` same shape
- Extend `Job` with `payerId: string` (required), `designerId?: string | null`, `architectId?: string | null`, `gcId?: string | null`, `homeownerId?: string | null`
- Keep `client: string` for one release as display fallback

### 6. New feature folder `features/contacts/`

```
features/contacts/
├── CLAUDE.md
├── lib/
│   ├── contactsStore.tsx       — Supabase-backed React store (jobsStore pattern)
│   ├── contactsRowMap.ts       — DB row <-> Contact type
│   └── aggregate.ts            — computeLifetimeRevenue, computeIntroducedClients
└── components/
    ├── ContactsList.tsx        — /crm index (anchors first, lifetime revenue, warmth chips, left-edge clay dot on anchors)
    ├── ContactDetail.tsx       — /crm/[id]; Linked Jobs is the lead, profile in sidebar
    ├── ContactForm.tsx         — full-page form for /crm/new and /crm/[id]/edit
    ├── ContactCombobox.tsx     — typeahead used by /jobs/new; "+ create" expands inline mini-form
    ├── RoleTagPills.tsx        — neutral surface-muted pills
    └── WarmthChip.tsx          — clay-soft pill with mono day-count for stale anchors
```

`features/crm/` becomes a thin pointer to `features/contacts/` (CLAUDE.md note + re-export) to keep the `/crm` URL stable.

### 7. Surfaces (with P0/P1 contracts applied)

- **`/crm`** — replace `ClientsTable` with `ContactsList`. Anchor rows get left-edge clay dot. Columns: name + parent · role-tag pills (neutral) · lifetime revenue (mono) · client count · last-touched · warmth chip (clay-soft). Sort: anchors first, then revenue desc. Top-right "+ New contact" ink-pill.
- **`/crm/[id]`** — `ContactDetail`. Linked Jobs is hero. Profile sidebar. Introduced Clients below or in tab. "Touched today" ghost button on profile.
- **`/crm/new`** and **`/crm/[id]/edit`** — full-page `ContactForm`.
- **`/jobs/new`** — Payer required, visible by default (single combobox). "+ Add designer / GC / architect / homeowner" expands additional slots inline on click. "+ Create contact" from any combobox opens an inline expanding mini-form (NOT Modal).
- **`/jobs/[id]`** — OverviewTab gets a Parties card listing populated slots only (empty slots hidden), each linking to `/crm/[id]`.
- **`/` Briefing** — stale-anchor nudges enter as briefing items themselves, ranked by `last_touched_at`. Copy: *"Raubyn. 47 days since last touch. Pour her a coffee."* No new subsection.

### 8. Reused existing utilities

- `shared/components/ui/Modal.tsx` — reserved for destructive-confirm only
- `shared/components/forms/FormField.tsx` — `ContactForm` + inline quick-create
- `shared/components/ui/Pill.tsx` — base for `RoleTagPills` and `WarmthChip`
- `shared/lib/format.ts` — `formatCAD`, `formatDate`
- `features/jobs/lib/jobsStore.tsx` — pattern for `contactsStore`
- `features/crm/lib/aggregate.ts` — `computeMargin` for lifetime-margin column

## Critical files

**New (~14):**
- `supabase/migrations/20260525_contacts_and_job_slots.sql`
- `features/contacts/CLAUDE.md`
- `features/contacts/lib/{contactsStore.tsx, contactsRowMap.ts, aggregate.ts}`
- `features/contacts/components/{ContactsList, ContactDetail, ContactForm, ContactCombobox, RoleTagPills, WarmthChip}.tsx`
- `src/app/crm/[id]/page.tsx`, `src/app/crm/[id]/edit/page.tsx`, `src/app/crm/new/page.tsx`

**Modified (~8):**
- `shared/lib/types.ts` — Contact + RoleTag + extend Job
- `features/crm/CLAUDE.md` — point at new folder
- `features/crm/components/CrmView.tsx` — render `ContactsList`
- `src/app/jobs/new/page.tsx` — Payer-required + progressive disclosure for 4 other slots
- `features/jobs/lib/jobsStore.tsx` — `createJob` includes slot ids
- `features/jobs/lib/jobsRowMap.ts` — read/write 5 new columns
- `features/jobs/components/OverviewTab.tsx` — Parties card
- `features/briefing/lib/prompt.ts` (and/or `generateBriefing.ts`) — stale-anchor items in prompt

**Possibly deleted (after `jobs.client` drop release):**
- `features/crm/components/ClientsTable.tsx`
- `features/crm/lib/aggregate.ts` (moves into `features/contacts/lib/`)

## Verification

**Schema (this commit):**
1. `mcp__supabase__apply_migration` with the SQL above. Confirm `NOTIFY pgrst` reloads schema.
2. `SELECT COUNT(*) FROM contacts;` → 6.
3. `SELECT COUNT(*) FROM jobs WHERE payer_id IS NULL;` → 0.
4. `INSERT INTO jobs (...) VALUES (... no payer_id ...);` → fails (NOT NULL).
5. Trigger smoke: `UPDATE jobs SET notes = 'test' WHERE id = ...;` then `SELECT last_touched_at FROM contacts WHERE id = <payer of that job>;` → recent.

**UI (later commits):**
1. `npm run dev`.
2. `/crm` shows 6 contacts; Raubyn at top with left-edge clay dot.
3. `/crm/[id]` for Raubyn loads; Linked Jobs is hero; SayWell job present.
4. "Touched today" (ghost button) updates `last_touched_at`; list reflects.
5. Add `introduced_by_id` from SayWell to Raubyn; Introduced Clients subtable appears.
6. `/crm/new` creates a contact; visible in list.
7. `/jobs/new`: only Payer visible by default; "+ Add designer/GC/architect/homeowner" reveals each slot inline; Payer required (form blocks submit if empty); typeahead surfaces the 6 contacts; "+ Create contact" opens inline mini-form (NOT Modal).
8. `/jobs/[id]`: Parties card lists populated slots; empty slots hidden; each clickable to `/crm/[id]`.
9. SQL-set Raubyn `last_touched_at` to 45 days ago; refresh `/` briefing; see *"Raubyn. 45 days since last touch. Pour her a coffee."* as a briefing item (not a separate subsection).
10. Soft-archive a contact; disappears from default list; appears with "Show archived" filter.
11. Try to delete a payer-linked contact; sees Modal: *"Cannot delete. Linked to N jobs."*

**Critique gate:**
12. Run `/impeccable critique` on `/crm` and `/crm/[id]`. Target: ≥33/40 (matches `/` baseline).

## Memory updates after merge

- `project_good_woods_dashboard.md` — Contacts feature live; CRM derived-from-jobs model retired.
- `reference_spacecraft_key_relationships.md` — Raubyn/SayWell/etc. now live as real Supabase rows; this file becomes a backup / source-of-truth-on-day-1.
