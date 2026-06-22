# Mozaik import — target CSV shape ("Good Woods Job Costing" template)

**Status:** co-designed with Andrew 2026-06-22. This is the CSV the app's Slice-2
parser targets. Andrew shapes Mozaik's **"Job Costing"** pricing template to emit it
(Pricing tab → pick "Job Costing" → **Export → CSV**). Per **ADR 0012**, the app reads
**quantities + structure only** and re-prices with its own catalog + labour rates +
cost codes; Mozaik's `Amount`/`Markup`/`Total` columns are read-and-discarded.

Shape decisions (Andrew, 2026-06-22):
1. **Cabinet quantity = BOTH.** Per type, emit a **count** row (`#`, drives the
   per-cabinet cost codes + timer) *and* a **linear-feet** row (`Ft`, a size tag for
   the learning loop). Counts make the budget; ft refines minutes-per-ft over time.
2. **Per-room breakdown is preserved.** A job spans rooms (Kitchen, Vanity, Closets);
   each room becomes its own sub-group on the estimate with its own counts + budget
   lines. The parser keeps rooms separate **and** rolls a job total. → **All rooms
   must be fully expanded in the export** (don't let Mozaik collapse a room to just a
   total row — see Parser rules).
3. **Expanded trackable set (Andrew picked all).** Beyond the lean structure rows, also
   emit: **buyout doors/panels/drawer-boxes** + **inserts/accessories** (garbage &
   bottle pullouts, cutlery trays) → Catalog BOM; **hardware-mount + rollout/tray
   counts** (# pulls/hinges/guides/rollouts/trays) → per-unit mounting & assembly
   labour; **countertops** (sqft + joints/radius/cutouts) → countertop install
   trade-line; **molding** (lineal ft) → crown install; **weight + storage volume** →
   delivery driver (ties to New Surrey courier-by-weight).

## Columns

Mozaik's export is 5 columns: `Description, QTY, Units, Amount, Total`. The parser uses
only **col 1 (label)**, **col 2 (QTY)**, **col 3 (Units)**. `Units` seen: `# / Ft / SqFt`.
(`Show My Cost` / markup toggles don't matter to us — we ignore the money columns.)

## Rows to emit, per room

Order is informational; the parser keys on the (normalized) label, not position.

### Cabinet structure → cost-code quantities
| Label | Units | → App |
|---|---|---|
| `Base Cabinets` | `#` | `ASM-BASE` / `INST-BASE` / `DEL-…` qty (this room) |
| `Base Cabinets` | `Ft` | size tag on the base line (learning loop) |
| `Wall Cabinets` | `#` / `Ft` | `…-WALL` qty + size tag |
| `Tall Cabinets` | `#` / `Ft` | `…-TALL` qty + size tag |
| `# Base Finished Ends` | `#` | finishing + install adjust |
| `# Wall Finished Ends` | `#` | " |
| `# Tall Finished Ends` | `#` | " |
| `# Openings` | `#` | masking / finishing detail |
| `# Base Doors` | `#` | base/tall door finishing + install (separate rate from wall) |
| `# Wall Doors` | `#` | wall door finishing + install |
| `# Drawer Fronts` | `#` | finishing + install |
| `# Drawer Boxes` | `#` | assembly + hardware |
| `# Shelves` | `#` | shelf install |
| `# Appliances` | `#` | appliance install / moving labour |

### Hardware-mount & accessory labour (per-unit drivers → cost codes + learning loop)
| Label | Units | → App |
|---|---|---|
| `# Pulls` | `#` | pull-mount / install labour |
| `# Hinges` | `#` | hinge-bore / mount labour |
| `# Guides` | `#` | guide-mount labour |
| `# Rollout Shelves` | `#` | rollout assembly + mount labour |
| `# Tray Boxes` | `#` | tray assembly labour |
| `# Closet Rods` | `#` | closet-rod install (closet jobs) |

### Finishing
| `Finished Area` | `SqFt` | `FIN-SPRAY` qty |
| `Toe Skin` | `Ft` | install toe-kick |

### Material BOM → Catalog (re-priced); also the sheet count for cut pricing
Each sheet good as its own row, **label = the material name**, QTY = sheet count, Units `#`:
`3/4" Rift Sawn White Oak MDF Core,1,#` · `5/8 Plywood Birch Prefinished,19,#` …
Edgebanding as its own row, Units `Ft`: `Edgebanding - White Oak,250,Ft`.

### Hardware BOM → Catalog
Each hardware item by name, Units `#`:
`Blum Movento,23,#` · `Richelieu Leg,12,#` · `Round Metal Shelf Pin,40,#` ·
`Closet Rod - Round,2,#` …

### Buyout BOM → Catalog (re-priced; often the biggest cost line — e.g. New Surrey doors)
Doors / applied panels / drawer boxes that are **bought out** rather than shop-made,
each by style/name, with count and (for doors/panels) sqft:
`MDF Flat Panel Door,17,#` · `MDF Flat Panel Door,42.7,SqFt` · `Slab Applied Panel,2,#` ·
`Appliance Panel,2,#` · `Dovetail Drawer Box,12,#`. → matched to Catalog by name; can
feed a supplier order. (Appliance panelized fronts = applied panels — buyout here, and
their **install** is driven by `# Appliances` above.)

### Inserts / accessories → Catalog (+ install)
Accessory pull-outs and organizers, each by name, Units `#`:
`Garbage Pullout,1,#` · `Bottle Pullout,1,#` · `Cutlery Tray,2,#`. → Catalog BOM, plus a
per-unit install touch.

### Countertops → countertop install trade-line
| `Counter Tops` | `SqFt` | countertop area (material + install) |
| `Counter Tops` | `Ft` | lineal (edge/run) — optional |
| `# Counter Joints` | `#` | per-joint labour |
| `# Counter Radius` | `#` | per-radius labour |
| `Counter Cutouts` | `#` | per-cutout labour (sink/cooktop) |

### Molding → crown/molding install
| `Molding` | `Ft` | lineal ft — install labour + material |

### Delivery / packing drivers
| `Weight` | `lb` | delivery cost driver (New Surrey courier-by-weight) |
| `Storage` | `C.Ft` | cabinet volume — packing/delivery driver |

### Cut reference (no in-house CNC — ADR 0012)
| `# Sheets` | `#` | in-house cut price (tracked min/sheet × sheets × shop rate) **and** Toolpath sheet-count reference |
| `# Parts` | `#` | Toolpath quote reference |

**Dropped:** the `Machining Time (Hrs)` line. Toolpath quotes the CNC work; the in-house
table-saw price comes from `# Sheets` × the shop's tracked minutes/sheet. (See ADR 0012,
the "Cut" make-vs-buy decision.)

### Job-level (emit once, after the last room)
Sub-contractor rows (`Sub Contractor - Plumbing/Electrician/Painter`) → surfaced as
`job_trades` flags on the review screen (they carry no QTY; the app doesn't price them).

## Parser rules (Slice 2)

- **Encoding:** read UTF-8. Mozaik's section-header glyphs (`══════`) may arrive as
  mojibake — detect boundaries **structurally**, never by an exact header string.
- **Room boundary:** a row with a non-empty label and **empty QTY *and* empty Units**
  starts (or ends) a room group. Keep each room's rows together; also accumulate a job
  total. (In the real default export the room name carries the room's grand total in
  col 5 — that same "label, no QTY/Units" signature is the marker.)
- **Line match:** normalize the label (trim, collapse internal whitespace, strip a
  leading `#`/`*` decoration) and look it up in the known-row dictionary. Cabinet/
  finishing/cut rows are fixed keys; material + hardware rows match against the
  **Catalog by name**.
- **Unmatched rows** (a new material, a renamed hardware item) → the import **review
  screen**: map to an existing catalog item, add to catalog, or skip. No silent drop.
- **Collapsed room** (a room that exports only a total row, no detail lines) → flag
  "room not expanded — re-export with all rooms expanded" rather than importing a
  room with zero counts.
- **Discard** `Amount` and `Total` always; the app re-prices.

## Fixture

`docs/samples/mozaik-import-target-sample.csv` is a hand-built example of this target
shape (two expanded rooms, both count+ft cabinet rows). The Slice-2 parser test asserts
against it (per-room Base/Wall/Tall counts, sqft, sheet/hardware BOM, job-total rollup).
The messy *default* export remains at `docs/samples/mozaik-export-sample.csv` for
reference on what Andrew is reshaping away from.

## Complete pricing-item accounting (every item in the Pricing Templates doc)

Exhaustive pass over all pricing items Mozaik can emit (Pricing Templates HelpDocs,
pp.2–4), so nothing is silently dropped. **K** = keep in target CSV · **drop-$** =
Mozaik's own labour/$ calc we deliberately ignore and re-derive from counts · **skip** =
no app value.

| Mozaik item | Status | Where it lands / why not |
|---|---|---|
| Cabinets (by cabinet) | drop-$ | per-type counts used instead; Mozaik's per-cabinet $ ignored |
| Materials | **K** | Material BOM → Catalog (sheet count) |
| Inserts | **K** | accessory BOM (garbage/bottle pullouts, trays) |
| Appliances | **K** | `# Appliances` → appliance install labour |
| Banding | **K** | edgebanding BOM (lineal ft) |
| Doors | **K** | buyout BOM (count + sqft) |
| Drawer Boxes | **K** | buyout BOM |
| Applied Panels | **K** | buyout BOM (incl. appliance panels) |
| Hinges / Guides / Pulls | **K** | hardware BOM (by name) |
| Closet Rods | **K** | hardware BOM + `# Closet Rods` install |
| Shelf Pins | **K** | hardware BOM |
| Drawer Front Fasteners / Spacers / Fasteners / Panel Fasteners | skip | consumable; folded into shop-supply overhead |
| Base/Wall/Tall Cabinets (Ft) | **K** | per-type `Ft` size tag |
| # Base/Wall/Tall Finished Ends | **K** | finishing + install |
| Finished Area | **K** | `FIN-SPRAY` (sqft) |
| Toe Skin | **K** | install toe-kick (lineal ft) |
| # Base Doors / # Wall Doors | **K** | per-type door finishing + install |
| # Drawer Fronts | **K** | finishing + install |
| # Drawer Boxes | **K** | assembly + hardware |
| # Tray Boxes | **K** | tray assembly |
| # Rollout Shelves | **K** | rollout assembly + mount |
| # Shelves | **K** | shelf install |
| # Openings | **K** | masking / finishing |
| Counter Tops (Ft/SqFt) | **K** | countertop trade-line |
| # Counter Joints / Radius / Cutouts | **K** | per-feature countertop labour |
| # Hinges / # Guides / # Pulls | **K** | per-unit mounting labour |
| # Closet Rods | **K** | closet-rod install |
| # Shelf Pins | skip* | covered by shelf-pin BOM + `# Shelves`; add as install count only if pin-install time proves material |
| # Dwr Front Fasteners / # Spacers / # Fasteners / # Panel Fasteners | skip | consumable counts; overhead |
| Molding | **K** | crown/molding install (lineal ft) |
| Storage (volume) | **K** | delivery/packing driver (C.Ft) |
| Shelf Frontage | skip* | low value; revisit if shelf-edge banding becomes a cost driver |
| Weight | **K** | delivery driver (courier-by-weight) |
| Labor / Part Labor | drop-$ | re-priced from our cost codes × counts |
| Machining | drop-$ | Toolpath quotes CNC; in-house = `# Sheets` × min/sheet (ADR 0012) |
| Door / Drawer Assembly Labor, Drawer Part Labor | drop-$ | re-priced from `# Doors` / `# Drawer Boxes` × our rates |
| Add On (#) / Add-On (% Subtotal/Total) | skip | overhead/markup — app applies its own |
| Tax / Subtotal / Total / Deposit / Balance Due | skip | app computes |
| Blank | skip | formatting only |

\* *skip\** = consciously left out as low-value; one line to add later if it proves to
matter. Everything else is either captured (**K**) or a Mozaik price we re-derive
(**drop-$**) per ADR 0012.
