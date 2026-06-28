# 0021. Central `quickbooks_links` mapping table

Date: 2026-06-28

## Status

**Accepted.** Extends **ADR 0010** (QuickBooks-ready costing model). Lands with
the QBO sync milestone, slice S2 (issue #148), behind
`NEXT_PUBLIC_INVOICES_QBO_ENABLED`.

> Numbering note: issue #148 asked for "ADR 0020", but 0020 was claimed by the
> scheduling milestone (`0020-scheduling-dual-dates-and-client-commitment.md`)
> that merged in parallel. This is the same decision, recorded at the next free
> number (0021).

## Context

ADR 0010 fixed the costing model's shapes so a future QuickBooks integration is
"a mapping, not a remodel", and explicitly promised:

> "When the sync lands, a single central `quickbooks_links` mapping table (local
> entity ↔ QB id) is a **pure addition** — no existing table changes."

The sync is now landing. Slice 8 (issue #53) shipped two interim, scattered
mapping columns — `invoices.qbo_vendor_id` and `invoice_lines.qbo_account` —
ahead of the central table, to unblock the QBO Bill export shape. Continuing
down that path means a new `qbo_*_id` column on every entity we ever sync
(jobs, estimates, customers, items, workers, phases…): columns that rot when
empty, can't express the same local entity mapping to different ids across
sandbox vs production or across reconnected companies, and offer no reverse
lookup ("which local entity is QBO Vendor #99?").

## Decision

**One central `quickbooks_links` table maps every local entity to its QBO id.**

```
quickbooks_links(
  id, local_type, local_id, qbo_type, qbo_id,
  realm_id, environment, synced_at, created_by, created_at, updated_at)
UNIQUE (realm_id, local_type, local_id)
```

- A row reads: "in QuickBooks company `realm_id`, our `local_type` #`local_id`
  IS QBO `qbo_type` #`qbo_id`".
- `local_id` is **TEXT** and there is **no foreign key** — the mapping is
  polymorphic and local PKs vary (jobs.id is text, invoices/contacts are uuid).
- The unique key `(realm_id, local_type, local_id)` is the upsert conflict
  target: a local entity maps to exactly one QBO object per company. A secondary
  index on `(realm_id, qbo_type, qbo_id)` powers the reverse lookup.
- `realm_id` + `environment` are on the row so the same local entity can hold
  distinct ids per company / per Intuit environment without collision.
- RLS: authenticated-all, anon-none (owner-only; the client portal never reads
  it), mirroring `quickbooks_connection` (S1).

Read/write helpers live in `features/invoices/lib/quickbooksLinksServer.ts`
(service-role, degrade-to-empty when unconfigured); the pure row↔object mapping

- `resolveVendorRef` precedence helper live in `quickbooksLinks.ts` and are
  unit-tested for round-trip.

**The slice-8 columns become legacy back-compat, not the source of truth.**
`buildQboExport` now takes an optional `centralVendorRef`; when a central link
exists it WINS over `invoices.qbo_vendor_id` (`resolveVendorRef`). The columns
are kept (additive, no destructive migration) as a manual fallback until the
sync fully populates the central table, then they can be retired in a later
slice.

## Alternatives considered

- **Keep adding `qbo_*_id` columns per entity** (the slice-8 pattern). Rejected
  — exactly the scattered-columns rot ADR 0010 warned against; no per-realm /
  per-environment distinction; no reverse lookup; a schema change per entity.
- **A typed table per local kind** (`qbo_invoice_links`, `qbo_vendor_links`…).
  Rejected — N near-identical tables and helpers for what is one uniform tuple;
  the polymorphic `local_type` column collapses them into one.
- **Add a foreign key on `local_id`.** Impossible for a polymorphic column
  (and FK type mismatches bite — jobs.id is text, others uuid). Integrity is
  enforced by the writing helper + `local_type`, not a DB-level FK.

## Consequences

- New additive `quickbooks_links` table; **no core costing table changes**,
  honouring ADR 0010's promise.
- All future QBO id mappings (job ↔ Project, estimate ↔ Estimate, supplier ↔
  Vendor, cost code ↔ Item, worker ↔ Employee…) are rows here, not new columns.
- `invoices.qbo_vendor_id` / `invoice_lines.qbo_account` are demoted to legacy
  fallback; the central link is authoritative via `resolveVendorRef`. A later
  slice can backfill links from those columns and drop them.
- The reverse index makes "what's already synced?" and dedupe cheap for the
  push/pull sync tasks.
