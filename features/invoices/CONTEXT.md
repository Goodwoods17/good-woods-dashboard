# Invoices — glossary (read before touching this feature)

The vocabulary here is load-bearing; several words already mean specific things
elsewhere in the codebase. Use them precisely.

- **Invoice** — a captured supplier bill (one uploaded file + its extracted
  header and lines). A row in the new `invoices` table. NOT a customer-facing
  sales invoice (that is `jobs.invoice` / `job_invoices`, money the shop is
  *owed*). This feature is about money the shop *paid*.
- **Invoice line** — one row of a supplier bill: qty, product no (supplier SKU),
  description, unit, unit price, amount, per-line tax flag. A row in
  `invoice_lines`.
- **Capture** — the instant, cloud-side step: file → Supabase Storage + an
  `invoice` row at `pending`. Engine-independent; does not need the home machine.
- **Extraction** — the LLM step that fills header + lines from the file. Runs on
  the **home-machine engine** (headless Claude Code, Max plan, Opus 4.8) behind a
  swappable `extractInvoice()` function. See ADR 0019.
- **Status lifecycle** — `pending` (captured, not yet extracted) → `needs_review`
  (extracted, awaiting human) → `reviewed` (human-checked) → `posted` (written to
  actuals / catalog). Plus `error` (extraction failed after bounded retry).
- **Post** — the explicit human action that writes a reviewed invoice's data into
  `job_cost_actuals` (the estimated-vs-actual ledger) and/or catalog pricing.
  Review-before-commit: nothing is written without it.
- **Actual** — a real cost recorded against a job, in the existing
  `job_cost_actuals` table (`kind` = material | subtrade | labour_adj). Invoice
  posting is a new *writer* of actuals; the BvA report is the reader. Do not
  confuse with **budget** (the estimate).
- **Provenance** — the link from a posted `job_cost_actual` back to the source
  invoice line, so the BvA report is auditable (click an actual → see its bill).
- **Offer** — an `item × supplier × price` row in `catalog_offers`; `sku` is the
  invoice-match key. Updating an offer from an invoice line uses the existing
  `updateOffer` + `logPrice(source: "import")`. (See catalog `CONTEXT.md` / ADR
  0006.)
- **Pre-tax / GST / PST** — always stored separately, never collapsed. Pre-tax is
  the BvA headline actual; "with PST" is shown alongside. Per-line **tax flag**
  records which lines were charged PST (invoices carry codes like Reimer's
  "PGST").
- **No job / shop stock** — an invoice not tied to any job (general consumables).
  Captured and price-updated, but hits no job's actuals.
- **Engine** — the implementation behind `extractInvoice()`. Today: home-machine
  Claude Code (Max). Documented fallback: the metered Anthropic API. Swapping is a
  one-function change.
