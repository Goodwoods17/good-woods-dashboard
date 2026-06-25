# Invoices (invoice capture & extraction)

Capture a supplier invoice **once, in the dashboard** — snap it, forward it, or
upload it — have it analysed, and feed the result into the two places that already
exist: the **estimated-vs-actual** report (real material/subtrade actuals) and the
**supplier catalog** (keep prices current from what you actually paid). Replaces
re-keying receipts into QuickBooks; QuickBooks sync is a later phase.

Read `CONTEXT.md` (the glossary) before touching this feature — several words
(invoice, actual, offer, post) already mean specific things elsewhere. The engine
decision and its caveats are **ADR 0019**.

## The shape (why this is mostly wiring, not new machinery)

- **Estimated-vs-actual needs no rebuild.** It already reads `job_cost_actuals`
  (`kind` = material | subtrade | labour_adj). Posting an invoice **writes rows**
  there. (`features/job-costing/lib/budgetVsActual*.ts`.)
- **Catalog pricing is ready.** `item × supplier × price` offers with `sku` as the
  match key, and `catalog_price_history` already has a `source: "import"` value.
  Updates reuse `addOffer` / `updateOffer` + `logPrice`. (`features/catalog`.)
- **What's genuinely new:** file storage (Supabase Storage — `documents` is
  Drive-URL only today), the `invoices` / `invoice_lines` tables, and the
  extraction engine.

## Capture → extract → review → post

1. **Capture (instant, cloud, laptop-independent):** upload/snap/forward a PDF or
   photo (PDF, JPG, PNG, HEIC) → private Supabase Storage bucket (RLS
   authenticated) + an `invoice` row at `pending`. Documented the moment it lands.
2. **Extract (home-machine engine):** headless Claude Code on the Max plan, **Opus
   4.8**, behind a swappable `extractInvoice(file) → ExtractedInvoice` function.
   A **daily scheduled sweep** (set time) + a **manual "process now"** button pull
   `pending` files, extract strict JSON, validate, write header + lines, status →
   `needs_review`. `poppler-utils` is required for scanned PDFs. The metered API is
   the documented one-function fallback (ADR 0019).
3. **Review (mandatory):** editable header + line table; low-confidence fields
   highlighted; math validation (Σ lines + GST + PST = total); duplicate-invoice
   guard. Human confirms → `reviewed`.
4. **Post (explicit):** writes `job_cost_actuals` (with provenance) and/or catalog
   price updates → `posted`. Nothing is written without this step.

## Data captured (taxes never collapsed)

Header: supplier, invoice #, issue/due dates, PO/order ref, pre-tax total, GST,
PST, total. Lines: qty · product-no (SKU) · description · unit · unit price ·
amount · per-line tax flag. Plus **per-field confidence** and the source file
reference. Tax: pre-tax + GST + PST stored always; BvA books **pre-tax as the
headline actual** + shows **"with PST"** alongside.

## Conventions

- Folder `features/invoices/` (`components/*.tsx`, `lib/*.ts`); thin route at
  `src/app/invoices/page.tsx`. Camera capture and the public surfaces follow the
  project's `"use client"` / server split.
- Money via `formatCAD`. Supabase + RLS authenticated for all new tables and the
  Storage bucket. Migrations are timestamped SQL in `supabase/migrations/`.
- Reuse, don't duplicate: write actuals through the job-costing store's patterns;
  update prices through the catalog store (`addOffer`/`updateOffer`/`logPrice`).

## Non-goals (this milestone)

- **No QuickBooks API sync** — only a QBO-ready data shape + a JSON export stub.
- **No estimator change** — bridging non-recoverable PST into quotes is a separate
  feature; this one only provides the data (ADR 0019 follow-up).
- **No catalog price-update for door/matrix invoices** (New Surrey) — those have
  no SKUs; door invoices still capture **actuals**.
- **No auto-post** — review-before-commit is non-negotiable.

## Definition of done (feature)

A snapped or forwarded invoice is stored instantly, extracted by the home-machine
engine on schedule (or on demand), reviewed with tax split + math + duplicate
checks, and posted so its actuals appear in estimated-vs-actual (auditable back to
the bill) and its SKU lines update catalog pricing — all behind authenticated RLS,
with the extraction engine swappable to the API in one change.
