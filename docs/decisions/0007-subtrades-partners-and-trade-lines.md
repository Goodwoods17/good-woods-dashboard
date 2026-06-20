# 0007. Suppliers and subtrades get profiles via a Partners hub; jobs gain trade-lines

Date: 2026-06-20

## Status

**Accepted.** Extends ADR 0006 — which established that suppliers are their own
table, **not** CRM contacts — to cover subtrade profiles, supplier profiles, and
per-project trade coordination. Planned via a `/grill-with-docs` session
(2026-06-20); glossary terms landed in `docs/domain.md` the same day.

## Addendum (2026-06-20) — people with roles

Reverses decision #3 ("one embedded contact per vendor") after Phase 1 review.
A supplier or subtrade has **many people**, each with a **role** (owner,
estimator, installer, foreman, scheduler, accounts...), and a project trade-line
can be assigned to a **specific person** (the countertop installer who shows up),
not just the company. Implemented as a `partner_people` child table keyed to one
of `catalog_suppliers` / `subtrades`, plus a nullable `job_trades.person_id`.
Vendors stay OUT of the CRM `contacts` table (the unify-into-contacts alternative
was reconsidered here and again declined — vendor profiles keep their own shape;
this only adds a people list). The earlier embedded `contact_name`/`phone`/`email`
columns are superseded by the people list and left inert.

## Context

The dashboard gives **clients** a full profile (the `contacts` table →
`/crm/[id]`: linked jobs, lifetime revenue, warmth, introductions) but nothing
comparable for the other parties Spacecraft works with:

- **Suppliers** exist only as procurement plumbing inside the Catalog
  (`catalog_suppliers` + `catalog_offers`) — a name attached to a price, with no
  openable profile.
- **Subtrades** (install crews, finishers, electricians, etc.) do not exist as an
  entity at all. "Installer" is a read-only daily schedule view; "subcontractor"
  is only a job-blocker label.

Andrew wants two things: (1) to **open a profile** for a supplier or subtrade, and
(2) to **plan and assign the trades a project needs**, from the project page,
before or during the job, color-coded by discipline.

The tempting move is a unified model — make every party a role-tagged `contacts`
row (the table was built for "every party… and the in-between cases," and
`role_tags` are TypeScript-validated, so adding `'supplier'`/`'subtrade'` needs no
migration). It was considered and rejected — see below — consistent with ADR
0006's prior call.

## Decision

**Parties stay separated by what we pay them for. Clients live in `contacts`;
suppliers and subtrades each get their own profile, surfaced through a new
"Partners" hub. Projects gain first-class trade-lines.**

1. **Subtrades are their own table** (`subtrades`), extending ADR 0006's
   "vendors are not customers" principle to labour. A subtrade is an **external**
   company/person hired to perform work on a job (install, finishing, countertop,
   electrical, plumbing, delivery, upholstery). In-house crew remain
   employees/Users (the `installerId` path), **not** subtrades.

2. **Suppliers reuse and enrich `catalog_suppliers`** rather than getting a second
   table. The existing row (already owning offers + a dormant `contact_id`) gains
   the profile fields it lacks (contact name, phone, address, account #, lead-time
   note, `active` soft-delete) and an openable page. Offers keep pointing at the
   same row — supplier identity never fractures.

3. **Human contact info is embedded on the row**, not linked to `contacts`. One
   main contact per vendor (name/phone/email/address as plain columns). The
   dormant `catalog_suppliers.contact_id` stays dormant. This keeps both tables
   self-contained and avoids minting a CRM contact for every sales rep.

4. **Each party gets a fit-for-purpose profile.** Supplier hero = **"what we buy
   here"** (its catalog offers + price deltas). Subtrade hero = **"jobs worked"**
   (its trade-lines). Neither inherits the client profile's revenue/warmth/anchor
   machinery, which would be noise-to-misleading for a vendor.

5. **A `trades` registry** (Settings-managed table) is the single home for the
   discipline taxonomy: each trade has a label, an icon, a **color**, a
   `suggested-by-default` flag, and sort order. Adding "upholsterer" is a registry
   row, not a code change.

6. **Projects gain trade-lines** via a `job_trades` join: `{ job, trade,
   subtrade (nullable), status, optional cost, notes }`. The `subtrade` FK is
   **nullable** so a trade can be added as *needed* before the company is chosen.
   It's many-to-many (a job has an installer *and* a finisher; a subtrade works
   many jobs). Surfaces as a **Trades** card on `/jobs/[id]`, sibling to Parties.

7. **Suggested trades are opt-in, not auto-written.** Registry trades flagged
   `suggested-by-default` appear as a **tap-to-add strip** on the Trades card;
   nothing is written to a project until tapped.

8. **Trade colors get their own palette, off the semantic axes.** A curated
   categorical palette (new design tokens, deliberately *not* the pipeline
   taupe/clay or health sage/amber/red hues), shown as a small dot + icon, never
   large fills. Final palette is subject to an `/impeccable` craft pass so a trade
   color never reads as a status signal. Honors the Rare-Accent Rule that already
   keeps role pills neutral.

9. **No money rollups in v1.** Profiles show identity + relationships + history
   only. The `job_trades.cost` field is captured for the future but never summed
   or charted yet (a future P&L tie-in).

10. **One "Partners" hub** at `/partners` with **Suppliers | Subtrades** tabs;
    profiles at `/suppliers/[id]` and `/subtrades/[id]`. Clients stay in `/crm`.
    The Catalog offers editor deep-links into a supplier profile.

## Alternatives considered

- **Unify every party as a role-tagged `contacts` row.** Rejected, consistent with
  ADR 0006. The `/crm` profile is built around the client *sales* story (revenue,
  warmth nudges, anchor pinning, "introduced by"); a vendor has none of that, and
  a "reconnect with your plywood supplier" nudge is noise. Separation lets each
  profile be the right shape. Accepted cost: "who we work with" spans three homes.
- **A second, dedicated `suppliers` table.** Rejected. `catalog_suppliers` already
  owns the offers relationship; a parallel table fractures supplier identity inside
  the catalog and demands a sync or migration. Enrich what exists.
- **Single subtrade slot on jobs** (mirroring the client FK slots). Rejected.
  Caps a job at one subtrade and breaks the instant a job has both an installer
  and a finisher.
- **Auto-populate every project with the default trades.** Rejected. Sprouts
  phantom lines on projects that don't need them and writes data the user didn't
  ask for. Tap-to-add instead.
- **Free, full-saturation color per trade.** Rejected. Collides with the reserved
  amber/sage/red/clay meanings and muddies status signals app-wide. A dedicated
  off-axis palette gives the glance value without the collision.
- **Subtrade carries its `trade` only as a TS-validated string** (like
  `role_tags`). Rejected for the taxonomy home: trades need a color + suggested
  flag + user management, which a string union can't hold — hence the `trades`
  registry table. (The per-job `job_trades.trade_id` remains the authoritative
  record of *what a subtrade did on that job*, so a multi-discipline company is
  handled per assignment, not per profile.)

## Consequences

- **Additive schema.** New `subtrades`, `trades`, `job_trades`; additive columns
  on `catalog_suppliers`. Nothing existing is dropped. RLS authenticated-only,
  mirroring catalog/contacts.
- **Cross-feature touch points:** new `features/partners/` owns the hub + subtrade
  store + Trades card logic + registry editor; `features/catalog/` gains the
  supplier-profile fields and a deep-link out; `features/jobs/` renders the Trades
  card on `/jobs/[id]`; `features/settings/` hosts the registry editor.
- **A new categorical color palette** enters the design system and must clear an
  `/impeccable` pass before it ships — tracked as a gate in `PLAN.md`.
- **The future is unblocked but explicitly out of scope:** spend/paid rollups,
  purchase orders, communication history, multi-contact-per-vendor, and surfacing
  subtrades on `/installer` alongside in-house crew. None requires re-touching this
  schema.
- The glossary for these terms lives in `docs/domain.md` (Parties section).
