# Mozaik Pricing Template — what it can output (for designing our import CSV)

Source: Mozaik "Pricing Templates" HelpDocs PDF (provided by Andrew 2026-06-22).
**Key fact:** the Mozaik pricing template is **fully configurable** — Andrew drags
which items appear, in what order, with custom descriptions, and chooses which
columns show. So **we co-design the export CSV to match the app** (ADR 0012); we do
NOT have to parse Mozaik's messy default. A template named **"Job Costing"** is shown
in the doc — likely the one to shape for us.

## CSV columns available (toggleable)
`Include · Tax · Item · Description · QTY · Units · Amount (unit $) · Markup · Total`
→ For our import we want **Item + Description + QTY + Units** (quantities/structure).
Per ADR 0012 we **drop Amount/Markup/Total** (Mozaik's prices) and re-price in-app.
There's also a "Show Cost only" toggle (strips markup/add-ons).

## Pricing items, grouped by how they'd map into our app

### → Material BOM (Catalog, re-priced by app)
- **Materials** (sheet goods; qty from cutlist, priced in Mozaik's Stock Material Library)
- **Banding** (edgebanding, lineal)
- **Doors / Drawer Boxes / Applied Panels** (buyout or manufactured)
- **Hardware (counts):** Hinges, Guides, Pulls, Closet Rods, Shelf Pins, Drawer Front
  Fasteners, Spacers, Fasteners, Panel Fasteners — plus `# Hinges/# Guides/# Pulls/…`
  fixed-count variants
- **Inserts, Appliances, Molding, Counter Tops (Ft / SqFt) + joints/radius/cutouts**

### → Cabinet counts (drive cost-code quantities: Base/Wall/Tall)
- **Base / Wall / Tall Cabinets (Ft)** — per-type **linear feet** (best per-type signal)
- **# Base / # Wall / # Tall Finished Ends**
- **# Openings, # Shelves, # Doors (Base/Wall), # Drawer Fronts, # Drawer/Tray Boxes,
  # Rollout Shelves**
- **Toe Skin (lineal ft), Shelf Frontage (lineal ft), Storage (volume), Weight**

### → Labour / cost codes (we take the QTY/Units, re-price with our rates)
- **Finished Area (SqFt)** → Finishing cost code (FIN-SPRAY)
- **Labor / Part Labor** → general shop labour (configurable hours)
- **Machining** → a CALCULATED hours line (perimeter ÷ material Speed + sheet-handling +
  part-handling). **This is the CNC/Toolpath work.** Per ADR 0012 (no in-house CNC —
  table saw only), Andrew can **drop or rename** this; CNC = Toolpath sub. Keep its
  QTY only if useful for the Toolpath sheet count.
- **Door Assembly Labor, Drawer Part Labor, Drawer Assembly Labor**
- (Assembly of Base/Wall/Tall + Install lines in the sample are template line-items, not
  base pricing-item names — Andrew builds those from `Labor`/`Add On (#)` per type.)

### → Add-ons / overhead / totals (app handles its own)
- **Add On (#)** (per-cabinet), **Add-On (% Subtotal)**, **Add-On (% Total)**
- **Tax, Subtotal, Total, Deposit, Balance Due, Blank**

## Design implications for Slice 2 (Mozaik import) — do NEXT SESSION
1. **Shape a dedicated "Job Costing" Mozaik template** that emits exactly:
   per-type cabinet linear-ft (or counts), finished ends, **Finished Area sqft**,
   **material sheets**, **edgebanding**, **hardware counts**, toe-skin lin-ft —
   each as `Item, QTY, Units`. Drop the Machining line (Toolpath does CNC).
2. **Map those rows → app:** cabinet linear-ft/counts → ASM/INST/DEL cost-code qty;
   Finished Area → FIN code; Materials/Banding/Hardware → Catalog BOM.
3. Confirm whether per-type **linear feet** or **counts** is the better quantity to
   drive the Base/Wall/Tall cost codes (Mozaik offers both).
4. The parser then targets this clean shape — far simpler than the default export
   (`docs/samples/mozaik-export-sample.csv`).
