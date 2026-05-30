# Estimator

Mozaik-shaped quote builder. Each line is a uniform `category · item ·
qty × unit × $/unit` row with optional `waste %` for hardwoods/sheet
goods, and per-line markup. Convert to a draft Job in one click.

## What it does

Single page (`/estimator`) with these sections, top to bottom:

1. **Project** — client + project name.
2. **Line items** — every line has: category (free-text with dropdown of
   common ones), item name, optional description, qty, unit
   (`# / SqFt / Ft / bf / Hrs`), $/unit, optional waste %, markup %. The
   row footer shows: `Cost · Markup % (+$X) · Line total`.
3. **Defaults** — workshop overhead % and default markup % (seeds new
   lines, doesn't retroactively change existing ones).
4. **Cabinet summary** — # base / wall / tall cabinets and their linear
   feet, plus # pulls and an optional room Ft. Info only; not priced.
   Will feed metrics later ($ per linear foot, assembly time per cabinet
   type, etc).

Sidebar **Quote summary**: Materials · Labour · Direct · Overhead ·
Total cost · Markup (with effective margin %) · Quoted price.

Click **Save as Job** → draft Job in pipeline stage Sold, costs split
into the canonical materials/labour/overhead CostLine schema, invoice
line items reflect per-line marked-up prices.

## Where things live

```
features/estimator/
├── lib/
│   ├── types.ts                   LineItem, Unit + labels, CabinetSummary,
│   │                              DEFAULT_LABOUR_RATE, DEFAULT_MARKUP_PCT
│   ├── sections.ts                QUOTE_SECTIONS (the fixed 9), bucket
│   │                              mapping, toggle helpers
│   ├── totals.ts                  computeTotals — pure pricing math with
│   │                              waste, bucketed by section
│   └── createJobFromEstimate.ts   builds a Job spec from estimator state
└── components/
    ├── EstimatorView.tsx          top-level: state + handlers + GC toggle
    ├── ProjectSection.tsx         Client + Project fields
    ├── LineItemsTable.tsx         Wrapper card; renders one column header
    │                              + one SectionBlock per quote section
    ├── SectionBlock.tsx           One section: divider header + subtotal +
    │                              its lines + "Add line in {section}". Has
    │                              an on/off Toggle when section is
    │                              toggleable (GC Subcontractors).
    ├── LineItemRow.tsx            Single horizontal grid row, all 11
    │                              columns side-by-side. Grid template is
    │                              applied via inline style.
    ├── MarkupSection.tsx          Overhead % + Default markup %
    ├── CabinetSummary.tsx         Bottom info block (counts + linear ft)
    ├── QuoteSummary.tsx           Sidebar summary + Save
    └── inputs.tsx                 FieldInput, NumberInput, Sub, SummaryRow,
                                   CategoryInput (free-text + datalist)
```

## The 9 sections

| #   | Section           | Bucket    | Notes                                             |
| --- | ----------------- | --------- | ------------------------------------------------- |
| 1   | Materials         | materials | Sheet goods, hardwoods, banding                   |
| 2   | Hardware          | materials | Hinges, guides, legs, fasteners, pulls            |
| 3   | CNC               | labour    | Toolpath subcontract or in-house CNC time         |
| 4   | Doors & Faces     | materials | Doors from supplier + CNC'd fillers/scribes       |
| 5   | Assembly          | labour    | In-house assembly labour                          |
| 6   | Finishing         | labour    | In-house spray ($ / SqFt)                         |
| 7   | Delivery          | materials | Trucking to site                                  |
| 8   | Install           | labour    | On-site labour at shop rate                       |
| 9   | GC Subcontractors | materials | Electricians, plumbers, painters — **toggleable** |

Custom categories (anything not in this list) render in a fallback
"Other" section at the bottom and bucket as materials by default.

`src/app/estimator/page.tsx` is a 4-line shell.

## Domain notes

- **Units** mirror Mozaik labels in the UI: `#` (count), `SqFt`, `Ft`
  (linear feet), `bf` (board feet, hardwoods), `Hrs`. Internal codes
  are `ea / sqft / lf / bf / hr`.
- **Waste %** is only useful for materials machined to size (hardwood
  rails & stiles, sheet goods). `buyingQty = qty × (1 + waste%/100)`.
  Line cost is computed on the buying qty, not the finished qty — so
  Andrew doesn't eat the waste himself. Waste field auto-shows for
  `bf / SqFt / Ft` units; auto-hides for `#` and `Hrs`.
- **Materials vs Labour bucketing** is by section (see `lib/sections.ts`):
  CNC / Assembly / Finishing / Install bucket as labour; everything else
  buckets as materials. Lines whose category doesn't match a known
  section default to materials. This determines how the saved Job's
  CostLine entries are grouped.
- **Markup is on cost** (`linePrice = lineCost × (1 + markup%)`). Cost
  here already includes waste. So a 35% markup on a hardwood line is
  35% on the waste-adjusted purchase amount.
- **Overhead** is applied workshop-wide on direct cost (materials +
  labour), added on top of the marked-up line prices. The sidebar
  shows the **effective margin %** (gross profit / quoted) so the
  cabinetmaker view (markup) and the P&L view (margin) line up.

## Markup vs margin reminder

A 35% **markup** on $1,000 cost = $1,350 (margin 25.9%).
A 35% **margin** on $1,000 cost = $1,538 (markup 53.8%).
The estimator uses markup. If a future change ever switches to margin
math, prices drop ~10% on a 35% job.

## When to revisit (Phase 2+)

- **Catalog integration** (Phase 2). Expand the Catalog feature to hold
  any reusable item (sheet goods, hardwoods, hinges, guides, fasteners,
  legs, labour rates). The estimator row gets a "pick from Catalog"
  affordance and a "save this line to Catalog" button. `catalogId` is
  already in the LineItem type for this.
- **CSV import** (Phase 3). Drop a Mozaik CSV → parse the section
  headers as `category`, items as lines, unit symbols (`# / SqFt / Ft
/ Hrs`) → unit codes, cabinet count rows → CabinetSummary, the
  `Add-On %Subtotal` line → seed `defaultMarkupPct`. Skip
  zero-priced rows by default (toggle to show).
- **Inventory link** (depends on CSV import + Catalog integration above).
  Once estimator lines carry real per-material quantities (a per-job bill
  of materials, fed by the Mozaik CSV import), **Inventory** cross-checks
  stock-on-hand against upcoming job needs ("Henderson is short 4 sheets").
  Keep Estimator and Inventory linked: the BOM produced here is the data
  source for the Inventory job-needs view. See
  `features/inventory/CLAUDE.md`.
- **Cabinet count metrics** (Phase 4). $ per cabinet linear foot,
  assembly time by cabinet type, install time by cabinet type. Needs
  a few saved jobs with cabinet counts to be useful.
- **Per-cabinet templates** ("10ft kitchen kit" → 7 base + 9 wall + N
  parts) would live in `features/estimator/lib/templates.ts`.
- **PDF quote export** (separate from invoice) — reuse the invoice
  rendering pipeline.
