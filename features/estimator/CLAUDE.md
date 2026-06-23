# Estimator

Mozaik-shaped quote builder. A quote is a stack of **10 fixed sections**
(pre-work → deficiencies) the way Andrew actually works a job. Most
sections are uniform line-item tables (`category · item · qty × unit ×
$/unit`, with optional `waste %` and per-line markup); three are bespoke
structured blocks. Templates switch whole sections on/off; **Rooms** let
a client drop "the bathroom" in one click. Convert to a draft Job in one
click.

> **Spec status:** reconciled 2026-06-02 to match the shipped code
> (`d859c0f` 10-category restructure + rooms/templates, then the
> `c9a872f` redesign). If you change behaviour, update this file in the
> same commit — it is read-before-touch.

## What it does

Single page (`/estimator`), top to bottom:

1. **Project** — client + project name.
2. **Template picker** — choose which sections are active (see
   Templates). Switching a template toggles whole sections; custom
   templates persist in localStorage.
3. **Rooms panel** — zero or more named rooms, each independently
   enabled. Lines and cabinet entries can be tagged to a room; disabling
   a room removes its contribution from the quote (and its invoice
   lines) without deleting anything.
4. **The 10 sections** (see table). Line-layout sections render the
   spreadsheet grid; `prework`, `delivery`, and `deficiencies` render
   their own structured blocks.
5. **Cabinet summary** — counts + linear feet per cabinet type (base /
   wall / tall / island) plus # pulls. This is **not info-only**: it
   auto-derives Assembly, Install, and Delivery-loading hours via
   per-type minute defaults.

Sidebar **Quote summary**: Materials · Labour · Direct · Overhead ·
Contingency · Total cost · Markup (with effective margin %) · Quoted
price, plus a per-room rollup when rooms exist.

Click **Save as Job** → draft Job in pipeline stage `sold`, costs split
into the canonical materials/labour/overhead `CostLine` schema (pre-work
and contingency added as isolated labour lines), invoice line items
reflect per-line marked-up prices with overhead + contingency appended
so the invoice sum reconciles to `job.revenue`.

## The 10 sections

Source of truth: `lib/sections.ts` (`QUOTE_SECTIONS`).

| #   | id             | Label                     | Bucket    | Layout       |
| --- | -------------- | ------------------------- | --------- | ------------ |
| 1   | `prework`      | Pre-work                  | prework   | prework      |
| 2   | `casework`     | Casework                  | materials | lines        |
| 3   | `cnc`          | CNC subcontract           | materials | lines        |
| 4   | `doors`        | Door materials & profiles | materials | lines        |
| 5   | `face`         | Face components           | materials | lines        |
| 6   | `finishing`    | Finishing                 | labour    | lines        |
| 7   | `assembly`     | Assembly                  | labour    | lines        |
| 8   | `delivery`     | Packing & delivery        | materials | delivery     |
| 9   | `install`      | Install                   | labour    | lines        |
| 10  | `deficiencies` | Deficiencies              | labour    | deficiencies |

- **Bucket** decides how a section's cost groups on the saved Job's
  CostLine entries. `materials` and `labour` are billed; `prework` is a
  third bucket that is **internal-only** (`excludeFromQuote: true`) — it
  counts toward true cost and margin but never the client price.
- **Layout** `lines` uses the freeform grid; `prework` / `delivery` /
  `deficiencies` swap in bespoke blocks (the renderer reads
  `SectionDef.layout`).
- Custom categories (a line whose `category` matches no section label)
  fall into a fallback **"Other"** group at the bottom and bucket as
  materials.

## Templates

`lib/templates.ts`. A template is just a set of `activeSections`.
Five built-ins:

| id                  | Name                  | Active sections                                            |
| ------------------- | --------------------- | ---------------------------------------------------------- |
| `tpl_full_build`    | Full custom build     | all 10 (the default)                                       |
| `tpl_reface`        | Refacing              | prework, doors, face, finishing, delivery, install, defic. |
| `tpl_install_only`  | Install only          | prework, delivery, install, deficiencies                   |
| `tpl_design_only`   | Design / measure only | prework                                                    |
| `tpl_sub_finishing` | Sub finishing         | prework, finishing, delivery                               |

Custom templates persist in localStorage under `gw_estimate_templates_v1`
(forward-only schema). Moving them to Supabase is a Phase-2 item.

## Rooms

`Room { id, name, enabled }` in `lib/types.ts`. Lines carry an optional
`roomId`; cabinet entries carry an optional `roomId` per type. A disabled
room's lines contribute nothing to costs, markup, quoted price, the
invoice, or the per-room rollup — but are preserved so re-enabling is
free. `partitionCabinetSummaryByRoom` splits cabinet counts so
auto-derived Assembly/Install lines inherit the right room (one room per
cabinet type today — mixed-room within a type is out of scope).

## The bespoke blocks

- **Pre-work** (`PreWorkBlock`) — three fixed slots (site visit / design
  / estimating), hours each, priced at `designRate`. Internal cost only.
- **Delivery** (`DeliveryCalculator`) — distance-driven, not a line.
  `cost = gas (miles×2×$/mi) + travel (hours×installRate) + loading
(cabinetCount×loadMin/60 × shopRate)`. Loading time auto-scales with
  the cabinet count.
- **Deficiencies** (`DeficienciesBlock`) — two parts: an hours budget
  for typical touch-ups (`hoursBudget × installRate`) **plus** a
  contingency % applied to the quoted total for true unknowns.

## Where things live

```
features/estimator/
├── lib/
│   ├── types.ts                 Unit, Room, LineItem, LabourRates,
│   │                            CabinetSummary (base/wall/tall/island +
│   │                            pulls), per-type minute defaults,
│   │                            PreWork/Delivery/Deficiencies state + empties
│   ├── sections.ts              QUOTE_SECTIONS (the 10), bucket + layout
│   │                            mapping, excludeFromQuote helpers
│   ├── templates.ts             5 built-in templates + custom (localStorage)
│   ├── totals.ts                computeTotals (pure pricing) + the three
│   │                            block cost fns + cabinet→hours derivation
│   └── createJobFromEstimate.ts builds a Job spec (costs + invoice) from state
└── components/
    ├── EstimatorView.tsx        top-level: state + handlers + template/room wiring
    ├── ProjectSection.tsx       Client + Project fields
    ├── TemplatePicker.tsx       Template select + TemplateChip
    ├── RoomsPanel.tsx           Add/name/toggle rooms
    ├── LineItemsTable.tsx       Wrapper card; one SectionBlock per active section
    ├── SectionBlock.tsx         One section: header + subtotal + lines/block
    ├── LineItemRow.tsx          Single horizontal grid row (all columns inline)
    ├── PreWorkBlock.tsx         Pre-work slots (internal cost)
    ├── DeliveryCalculator.tsx   Distance/time/loading delivery cost
    ├── DeficienciesBlock.tsx    Hours budget + contingency %
    ├── MarkupSection.tsx        Overhead % + default markup % defaults
    ├── CabinetSummary.tsx       Counts + linear ft per type; feeds auto-derive
    ├── QuoteSummary.tsx         Sidebar summary + per-room rollup + Save
    └── inputs.tsx               FieldInput, NumberInput, Sub, SummaryRow, CategoryInput
```

`src/app/estimator/page.tsx` is a 2-line shell.

## Labour rates

`LabourRates { designRate, shopRate, installRate }` live in **workspace
settings** (`/settings`), defaults `85 / 85 / 95`. Pre-work prices at
designRate; assembly + in-shop work + loading at shopRate; install +
on-site + travel at installRate. `DEFAULT_LABOUR_RATE` in types.ts is a
legacy single-rate fallback only.

## Domain notes

- **Units** mirror Mozaik labels: `#` (count), `SqFt`, `Ft` (linear
  feet), `bf` (board feet), `Hrs`. Internal codes `ea / sqft / lf / bf /
hr`.
- **Waste %**: `buyingQty = qty × (1 + waste%/100)`; line cost is on the
  buying qty so Andrew doesn't eat the waste. Auto-shows for `bf / SqFt /
Ft`, auto-hides for `#` and `Hrs` (soft hint — the field still accepts
  a value on any unit).
- **Markup is on cost**: `linePrice = lineCost × (1 + markup%)` (cost
  already includes waste).
- **Negative inputs are clamped to 0** in `computeTotals` — a stray `-4`
  never silently inverts a cost.

## Pricing model (the exact math in `totals.ts`)

```
buyingQty   = qty × (1 + waste%/100)
lineCost    = buyingQty × unitPrice
linePrice   = lineCost × (1 + markup%/100)
direct      = Σ lineCost of enabled, non-prework lines (materials + labour)
overhead    = direct × overhead%
contingency = (Σ enabled linePrice + overhead) × contingency%
quoted      = Σ enabled linePrice + overhead + contingency
totalCost   = direct + overhead                       (firm — what you owe)
internalCost= direct + prework + overhead + contingency (true cost reality)
effectiveMarginPct = (quoted − totalCost − contingency) / quoted × 100
```

Contingency is treated as **expected labour**, not profit — it is
subtracted in the margin formula so an optimistic buffer can't inflate
the margin Andrew bids on. The saved Job records contingency as a
full-value labour CostLine for the same reason, so the in-app margin and
the bookkeeping reconcile.

### Markup vs margin reminder

A 35% **markup** on $1,000 cost = $1,350 (margin 25.9%). A 35% **margin**
on $1,000 cost = $1,538 (markup 53.8%). The estimator uses markup. If a
future change switches to margin math, prices drop ~10% on a 35% job.

## Non-goals (today)

- The estimate itself is **not** persisted to Supabase — there is no
  "draft estimate" table. State lives in component memory until you
  "Save as Job", which writes a Job. Re-opening `/estimator` is a blank
  slate. (Draft-estimate persistence is a candidate, see PLAN.md.)
- Catalog picking and a standalone PDF quote are not built — see "When to
  revisit". **Mozaik CSV import IS built** (ADR 0012 Slice 2): the "Import
  Mozaik CSV" button → `MozaikImportModal` → `lib/mozaikImport.ts`
  (`parseMozaikCsv` + `mozaikToEstimateDraft`) fills cabinet counts, the
  cost-code quantity overrides (FIN-SPRAY sqft / CUT-SHEET sheets), Rooms, and
  a material BOM (line items at $0 for catalog pricing — the app owns the
  money). Target shape: `docs/samples/mozaik-import-target-csv.md`; parser
  fixture + test: `mozaik-import-target-sample.csv` /
  `scripts/test-mozaik-import.ts`. Per-room cabinet granularity beyond
  one-room-per-type isn't representable in `CabinetSummary` yet, so the import
  rolls a job total + keeps room names as Rooms (per-room budget lines = a
  follow-on).

## When to revisit (Phase 2+)

See `PLAN.md` for sequencing. In short:

- **Catalog integration** (Phase 2) — "pick from Catalog" + "save line
  to Catalog". `catalogId` + price/supplier snapshot fields already exist
  on `LineItem`.
- **CSV import** (Phase 3) — drop a Mozaik CSV → section headers →
  categories, items → lines, unit symbols → unit codes, cabinet rows →
  CabinetSummary, the `Add-On %` subtotal → seed default markup. This is
  the prerequisite for the Inventory job-needs view.
- **Inventory link** (after CSV import) — the per-job BOM produced here
  feeds Inventory's stock-vs-needs check. See `features/inventory/CLAUDE.md`.
- **Cabinet-count metrics** (Phase 4) — $ per cabinet linear foot.
  ✓ Per-type assembly/install minutes now come from the Catalog
  (`catalog_cabinet_types` via `useCatalog().cabinetTypes`), tuned by
  the shop's labour timers; `DEFAULT_*_MINUTES` in `types.ts` are the
  fallback. The auto-derive reads live minutes, so a labour nudge flows
  into the next quote. (Loading minutes for delivery still use the
  default — `DeliveryCalculator` reads `loadMin` from settings/defaults,
  not yet the Catalog row.) Remaining: $/linear-foot metrics need saved
  jobs.
- **PDF quote export** — reuse the invoice render pipeline.
