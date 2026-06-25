# Invoices — implementation plan

Vertical slices in dependency order, tracer first. Each ships independently to
`main` (ADR 0017 — no stacked PRs; feature-flag not-ready work). Spec:
`CLAUDE.md`; glossary: `CONTEXT.md`; engine decision: ADR 0019.

**Build is HELD** until the parallel Forms `/cook` (milestones #2/#3, issues
#40–44) finishes. New `features/invoices` folder → no folder collision; run the
collision pre-flight before Phase B (watch shared nav/layout + migrations).

Gate legend: 🛑 = stop-and-ping before merge even in auto-mode (schema / money /
catalog), per ADR 0018.

---

## Slice 1 — Tracer: capture → store → home-machine extract → raw view 🛑 schema+infra

The thin thread through every layer, proving the riskiest assumption (Max-plan
extraction → strict JSON → Supabase).

- `invoices` + `invoice_lines` tables (status, supplier, invoice #, dates, PO,
  pre-tax/GST/PST/total; lines: qty, sku, description, unit, unit_price, amount,
  tax_flag, confidence). Private Supabase Storage bucket. RLS authenticated.
- In-app: upload a PDF/image → file to Storage + `invoice` row at `pending`.
- `scripts/extractInvoices.ts` (or equivalent): downloads one `pending` file,
  extracts via headless Claude Code (Opus 4.8) behind `extractInvoice()`, writes
  header + lines, status → `needs_review`. `poppler-utils` provisioned for scanned
  PDFs. Run manually once in this slice.
- Raw extracted JSON visible at `/invoices/<id>`.

**Done when:** uploading any of the four sample invoices lands a `pending` row +
stored file; running the extractor once produces correct header + lines (incl. the
scanned New Surrey via poppler) at `needs_review`, visible in-app. Gate + local
suite green; Playwright smoke covers upload → pending.

## Slice 2 — Scheduled processor

- Daily scheduled sweep at a set time + manual "process now" trigger; processes
  all `pending`; bounded retry (≤3 genuinely different attempts) then `error` with
  a captured message.
- In-app: pending count + "last run at" + per-invoice error surfaced.

**Done when:** the sweep drains `pending` unattended on schedule; "process now"
works on demand; failures land in `error` with a readable reason, not a silent
hang.

## Slice 3 — Review & edit screen

- Editable header + line table; **amber low-confidence** fields; **math
  validation** banner (Σ lines + GST + PST = total); pre-tax/GST/PST + per-line
  tax flag shown; **duplicate-invoice guard** (supplier + invoice #). Save →
  `reviewed`.

**Done when:** an extracted invoice can be corrected and marked `reviewed`; bad
math and duplicates are flagged before posting; tax components are all visible and
editable.

## Slice 4 — Supplier + job matching

- **Supplier auto-detect** from header → link existing `catalog_supplier` or
  offer to create. **Job auto-suggest** (PO/recent) + manual picker + **split
  lines across jobs**; **"no job / shop stock"** path.

**Done when:** a reviewed invoice has its supplier resolved and its lines assigned
to one or more jobs (or shop-stock), ready to post.

## Slice 5 — Commit to actuals + provenance 🛑 money

- **Post** writes `job_cost_actuals` (`kind` material/subtrade) — **pre-tax
  headline** + "with PST" alongside — with a provenance link to the source
  invoice line. BvA report shows them; click an actual → its bill. Status →
  `posted`.

**Done when:** posting a reviewed invoice makes its actuals appear in
estimated-vs-actual for the right job(s), each traceable back to the invoice line;
re-posting is guarded (no double-count).

## Slice 6 — Catalog price update 🛑 catalog

- **SKU auto-match** invoice lines → offers; show **old→new price delta**; accept
  → `updateOffer` + `logPrice(source: "import")`; **>X% jump nudge** (default
  threshold, configurable). Door/matrix invoices excluded.

**Done when:** accepting a matched line updates the supplier offer + writes price
history with `source: "import"`; large jumps are flagged for re-quote; unmatched
lines fall back to manual assignment.

## Slice 7 — Mobile camera capture (PWA)

- Phone camera, multi-page capture, snap-and-upload into the same capture path.

**Done when:** an invoice can be snapped (multi-page) from the phone and lands as
`pending` exactly like a file upload.

## Slice 8 — QuickBooks-ready shape

- Vendor/account/tax-code fields in the captured shape + a JSON export endpoint
  stub. No QBO API.

**Done when:** captured invoices expose a QBO-mappable shape and an export
endpoint returns it; no rework needed for the future QBO sync.

---

## Backlog (power moves all folded above; future)

- Cheap-model-for-clean / escalate-on-scanned extraction optimisation (only worth
  it if API engine is ever adopted; flat-rate Max makes it moot).
- Email-forward ingestion (forward a supplier email straight to an inbox address).
- Bulk multi-invoice drop + queue.
- Estimator change to bridge non-recoverable PST into quotes (separate feature —
  ADR 0019 follow-up).
