# 19. Invoice capture & extraction: home-machine Max engine, swappable

Date: 2026-06-25
Status: Accepted

## Context

The owner snaps/forwards a lot of supplier invoices and currently re-keys them
into QuickBooks. We want to capture each invoice **once, in the dashboard**, have
it analysed (line items, taxes, totals), and feed the result into two places that
already exist:

- the **estimated-vs-actual** report — it already reads a `job_cost_actuals`
  ledger (`kind` = material | subtrade | labour_adj), so invoice actuals flow in
  by **writing rows**, not by building a new report (see ADR 0009, 0014, 0015);
- the **supplier catalog** — an `item × supplier × price` offers model with `sku`
  as the natural match key and a `catalog_price_history` table that already has a
  `source: "import"` value waiting (see ADR 0006).

Three sample invoices (Reimer, PJ White, Richelieu) are **digital-text PDFs** with
clean line tables (`PRODUCT NO` = supplier SKU, qty, unit, unit price, amount,
GST, PST, totals). One (New Surrey doors) is a **scanned image** PDF that arrived
as an email attachment. So the feature must accept both clean PDFs and photos, and
both file uploads and phone-camera snaps.

QuickBooks integration is a later phase; this feature only has to capture the data
in a QBO-ready shape.

### The engine decision

Extraction needs an LLM with vision. Two engines were considered:

1. **Metered Anthropic API** (like the briefing feature). Fully supported, runs in
   the cloud, laptop-independent. Cost at the owner's volume (~80 invoices/mo) is
   trivial — ~$1.20/mo batched on Sonnet, ~$4/mo instant on Opus.
2. **The owner's Claude Max subscription**, via headless Claude Code on the
   always-on home machine (the same box that hosts the `gw` tmux + watchdog). ~$0
   in tokens; can run the strongest model (Opus 4.8) at flat rate.

The owner chose the Max/home-machine engine to avoid metered spend, consistent
with a standing preference to route AI through Claude Code where possible (the
briefing-via-API being the prior exception).

**Caveats recorded honestly:** (a) it only processes while the home machine is on,
so a multi-day outage means invoices pile up at `pending` (still safe, just
unsorted); (b) using a Claude *subscription* as the engine for an automated
production pipeline is a grey area against Anthropic's intended use — this is the
owner's informed, accepted risk, not a vouched-for pattern.

A spike during planning de-risked it: reading the three digital PDFs through
Claude Code (Max) already produced perfect structured line items. The scanned
New Surrey PDF failed only on a missing `poppler-utils` (needed to render image
PDFs for vision) — a one-package install, not a design problem.

## Decision

- **Capture is engine-independent and instant.** Snap/forward/upload (PDF, JPG,
  PNG, HEIC) → a **private Supabase Storage** bucket (RLS authenticated) + an
  `invoice` row at status `pending`. This is cloud-side and does not depend on the
  home machine.
- **Extraction sits behind one swappable function** (`extractInvoice(file) →
  ExtractedInvoice`). The first implementation is the **home-machine engine**:
  headless Claude Code on the Max plan, **Opus 4.8**, run by a **daily scheduled
  sweep at a set time** plus a **manual "process now"** trigger. It downloads
  `pending` files from Supabase, extracts strict JSON, validates, and writes the
  result back (status → `needs_review`). `poppler-utils` is a provisioned
  dependency for scanned PDFs.
- **The API engine is the documented fallback** — swapping it in is a one-function
  change if the home machine ever becomes a hassle.
- **Status lifecycle:** `pending → needs_review → reviewed → posted` (+ `error`).
- **Taxes are never collapsed.** Store pre-tax + GST + PST + a per-line tax flag
  on every invoice. The estimated-vs-actual report books **pre-tax as the headline
  actual** and shows a **"with PST"** figure alongside (the owner bills some jobs
  GST+PST, some GST-only, and wants to judge whether non-recoverable PST belongs
  in estimates).
- **Review-before-commit is mandatory.** Extracted data is never written to
  actuals or catalog pricing without an explicit human "post". Low-confidence
  fields are surfaced for checking.
- **Invoices need not be tied to a job** — a "no job / shop stock" path captures
  the invoice and updates catalog pricing without hitting any job's actuals.

## Consequences

- Estimated-vs-actual needs **no rebuild** — invoice posting writes
  `job_cost_actuals` with provenance back to the source invoice line.
- Catalog price updates reuse existing `addOffer`/`updateOffer` +
  `logPrice(source: "import")`; door invoices (matrix-priced, no SKUs) capture
  **actuals** but are excluded from catalog price-update.
- The home-machine engine is the project's first use of Claude Code as an app
  runtime engine. If Max usage limits, reliability, or ToS push back, the API
  fallback is one function away.
- **Follow-up (separate feature, not this milestone):** revisit the estimator so
  non-recoverable PST can be bridged into quotes — this feature provides the data
  to make that call.
